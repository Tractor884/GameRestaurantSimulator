/**
 * v2 §15 (этап 5 «Преимущества и события»): ДИЛЕММЫ — тяжёлые развилки,
 * срабатывающие ОТ СОСТОЯНИЯ (не чаще 1/квартал), эффекты «до конца игры».
 *
 * Правила (docs/BALANCING-V2.md §15):
 *  - триггеры проверяются на закрытии недели (weekclose),rng не нужен —
 *    решение о создании чисто детерминированное (пороги состояния);
 *  - замещают одно обычное событие недели срабатывания (бюджет пула
 *    не растёт): из activeEvents удаляется одно неразрешённое обычное
 *    событие той же недели;
 *  - приоритет по «давлению состояния»: насколько метрика выше порога;
 *    «франшиза» (позитивный триггер) — всегда последний резерв;
 *  - перманентные эффекты пишутся в restaurant.permanentEffects и
 *    отображаются в SettingsScreen → «Долгосрочные решения».
 *
 * Все rng-броски (скандал взятки, chef_quit) — ОТДЕЛЬНЫЕ потоки §21:
 * deriveRng(hashSeed(seed, week), '...'), детерминизм существующих
 * сценариев не сдвигается.
 */
import type { Dish, GameDate, GameEvent, GameState, Restaurant, RoleId } from '../types';
import { BALANCE_V2_2, BALANCE_V2_5, isLegacy } from '../config/balance2.config';
import { EVENT_TEMPLATES_MAP } from '../config/risks.config';
import { STAFF_ROLES, ROLE_IDS } from '../config/staffRoles.config';
import { dishOf } from '../content/resolve';
import { deriveRng, hashSeed } from '../rng';
import { clamp } from './core';
import { averageFatigue, applyQuit } from './staff';
import { turnoverRateFromState } from './bsc';
import { hireCostMult } from './permanent';

const QUARTER_WEEKS = 12;

/* ============================= ТРИГГЕРЫ ============================= */

interface DilemmaCandidate {
  templateId: string;
  /** Нормализованное давление: насколько состояние выше порога. */
  pressure: number;
}

/**
 * Проверка триггеров дилемм на закрытии недели. Возвращает событие-дилемму
 * ИЛИ null. Побочно обновляет окна (fatigueHighWeeks/ratingHighWeeks) и
 * замещает одно обычное событие недели (удаление из activeEvents).
 */
export function checkDilemmas(state: GameState, week: number, weekDate: GameDate): GameEvent | null {
  const restaurant = state.restaurant;
  if (!restaurant || isLegacy()) return null;
  const d = BALANCE_V2_5.dilemmas;
  if (d.perQuarter <= 0) return null;
  // Не чаще одной в квартал (12 нед). lastDilemmaWeek = 0 — дилемм ещё не
  // было: первое окно доступно сразу (иначе квартал 1 был бы пуст по артефакту
  // миграции — замер QA: legal=60 на нед 1 не давал диалог).
  const last = restaurant.lastDilemmaWeek ?? 0;
  if (last > 0 && week - last < QUARTER_WEEKS) return null;
  // Дилемма уже висит неразрешённой — не дублируем.
  if (state.activeEvents.some((e) => e.templateId.startsWith('dilemma_') && !e.resolved)) return null;

  // Окна триггеров (обновляются каждую неделю — counters в Restaurant).
  const fatigue = averageFatigue(restaurant.staff);
  restaurant.fatigueHighWeeks =
    fatigue > d.fatigueAvg ? (restaurant.fatigueHighWeeks ?? 0) + 1 : 0;
  restaurant.ratingHighWeeks =
    restaurant.reputation.rating > d.rating ? (restaurant.ratingHighWeeks ?? 0) + 1 : 0;

  const leverage = restaurant.finance.leverage ?? 0;
  const turnover = turnoverRateFromState(state);
  // Окно стабильности плеча: L > 1 ДВЕ недели подряд — свежий кредит визарда
  // (12 млн, касса на старт-фазе низкая) не должен звать банк в первую же
  // неделю; устойчивая нагрузка — зовёт (замер QA браузера: нед 1, L 1,62).
  restaurant.leverageHighWeeks =
    leverage > d.leverage ? (restaurant.leverageHighWeeks ?? 0) + 1 : 0;

  const candidates: DilemmaCandidate[] = [];
  if ((restaurant.fatigueHighWeeks ?? 0) >= d.fatigueWeeks) {
    candidates.push({
      templateId: 'dilemma_chef_menu',
      pressure: (fatigue - d.fatigueAvg) * 2 + (restaurant.fatigueHighWeeks ?? 0),
    });
  }
  if (restaurant.risks.legal > d.legalRisk) {
    candidates.push({ templateId: 'dilemma_inspector_bribe', pressure: restaurant.risks.legal - d.legalRisk });
  }
  if ((restaurant.leverageHighWeeks ?? 0) >= 2 && restaurant.finance.loans.length > 0) {
    candidates.push({ templateId: 'dilemma_bank_restructure', pressure: (leverage - d.leverage) * 40 });
  }
  if (turnover > d.turnover) {
    candidates.push({ templateId: 'dilemma_staff_crisis', pressure: (turnover - d.turnover) * 100 });
  }
  // «Франшиза» — позитивный триггер: только если остальных нет (S4: 0–1
  // «лёгкая» дилемма, §15 гейт).
  if (
    candidates.length === 0 &&
    (restaurant.ratingHighWeeks ?? 0) >= d.ratingWeeks &&
    restaurant.reputation.rating > d.rating
  ) {
    candidates.push({ templateId: 'dilemma_franchise', pressure: 1 });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.pressure - a.pressure);
  const top = candidates[0];

  const event = createDilemmaEvent(top.templateId, week, weekDate, restaurant);
  if (!event) return null;

  // Замещение: убираем одно обычное НЕразрешённое событие этой же недели
  // (бюджет пула событий не растёт — §15).
  const replaceIdx = state.activeEvents.findIndex(
    (e) =>
      e.date.week === week &&
      !e.resolved &&
      !e.templateId.startsWith('dilemma_') &&
      !EVENT_TEMPLATES_MAP[e.templateId]?.systemOnly,
  );
  if (replaceIdx >= 0) state.activeEvents.splice(replaceIdx, 1);

  restaurant.lastDilemmaWeek = week;
  state.activeEvents.push(event);
  return event;
}

/* ============================= ФАБРИКА СОБЫТИЙ ============================= */

function createDilemmaEvent(
  templateId: string,
  week: number,
  weekDate: GameDate,
  restaurant: Restaurant,
): GameEvent | null {
  const tpl = EVENT_TEMPLATES_MAP[templateId];
  if (!tpl) return null;
  const d = BALANCE_V2_5.dilemmas;
  const base: GameEvent = {
    id: `evt-${templateId}-${week}`,
    date: { ...weekDate },
    templateId,
    title: tpl.title,
    description: tpl.description,
    criticality: 'critical',
    effect: {},
    resolved: false,
  };

  switch (templateId) {
    case 'dilemma_chef_menu': {
      const menuSize = restaurant.menu.dishes.length;
      base.resolutions = [
        {
          label: 'Согласиться: сократить карту на 20%',
          cost: 0,
          note: `Убрать ~${Math.max(1, Math.round(menuSize * 0.2))} наименее популярных позиций. Порции стандартизируются: Food Cost −1 п.п. навсегда, средний чек −3% навсегда.`,
          dilemma: 'chef_accept',
        },
        {
          label: 'Отказать: карта остаётся',
          cost: 0,
          note: `Шеф обижен: риск увольнений ×${d.chefQuitMult} на ${d.chefQuitWeeks} нед, затем шеф уйдёт с шансом ${Math.round(d.chefQuitChance * 100)}%.`,
          dilemma: 'chef_refuse',
        },
      ];
      break;
    }
    case 'dilemma_inspector_bribe': {
      base.resolutions = [
        {
          label: `Заплатить «благодарность» (${(d.bribeCost / 1000).toFixed(0)} тыс ₽)`,
          cost: d.bribeCost,
          note: `Юридический риск −${d.bribeLegalDrop}. Но факт взятки остаётся с вами: риск скандала ${Math.round(d.bribeScandalYearly * 100)}%/год — удар по репутации и штраф.`,
          dilemma: 'bribe_pay',
        },
        {
          label: 'Отказать: оформить всё официально',
          cost: 0,
          note: `Инспектор оформил всё по протоколу: дальнейшие проверки жёстче — штрафы ×${d.refuseFineMult} навсегда, юридический риск −${d.refuseLegalDrop}.`,
          dilemma: 'bribe_refuse',
        },
      ];
      break;
    }
    case 'dilemma_bank_restructure': {
      const loan = restaurant.finance.loans[0];
      const newPayment = loan ? Math.round(loan.payment * d.restructurePaymentMult) : 0;
      base.resolutions = [
        {
          label: 'Реструктурировать кредит',
          cost: 0,
          note: `Платёж ${loan ? Math.round(loan.payment).toLocaleString('ru-RU') : '—'} → ${newPayment.toLocaleString('ru-RU')} ₽/4 нед (−25%), но срок +${d.restructureTermMonths} мес и ставка +${(d.restructureRatePP * 100).toFixed(1)} п.п. Переплата в горизонте года заметна.`,
          dilemma: 'restructure',
        },
        {
          label: 'Отказать: платим как раньше',
          cost: 0,
          note: `Банк фиксирует недоверие: кредитный лимит урезан до ${Math.round(d.refuseLimitShare * 100)}% навсегда — новые деньги в кризис брать негде.`,
          dilemma: 'restructure_refuse',
        },
      ];
      break;
    }
    case 'dilemma_franchise': {
      base.resolutions = [
        {
          label: 'Подписать франшизу',
          cost: 0,
          note: `Спрос +${Math.round((d.franchiseDemandMult - 1) * 100)}% навсегда. Но ${Math.round(d.franchiseOwnerShare * 100)}% выручки уходят сети — навсегда (неделя за неделей).`,
          dilemma: 'franchise_accept',
        },
        {
          label: 'Отказаться: остаёмся независимыми',
          cost: 0,
          note: `Престиж шефа растёт: +${d.franchisePrestige} к перспективе «Клиенты» BSC. Развитие — своим темпом.`,
          dilemma: 'franchise_refuse',
        },
      ];
      break;
    }
    case 'dilemma_staff_crisis': {
      const payrollWeekly = Math.round(
        ROLE_IDS.reduce(
          (s, roleId: RoleId) =>
            s +
            (restaurant.staff.pools[roleId]?.count ?? 0) *
              (STAFF_ROLES[roleId].monthlySalary / 4.33),
          0,
        ),
      );
      base.resolutions = [
        {
          label: `Поднять оклады на ${Math.round((d.crisisRaiseMult - 1) * 100)}% всем`,
          cost: 0,
          note: `ФОТ вырастет примерно на ${Math.round(payrollWeekly * (d.crisisRaiseMult - 1)).toLocaleString('ru-RU')} ₽/нед — навсегда. Взамен: текучесть возвращается в норму.`,
          dilemma: 'raise',
        },
        {
          label: 'Держаться: переждать волну',
          cost: 0,
          note: `Экономия сейчас, счёт потом: усталость бьёт по увольнениям сильнее (×${d.crisisQFatigueMult}), мораль −${d.crisisMoraleHit}, подбор персонала дороже ×${d.crisisHireMult} на ${d.crisisHireWeeks} нед.`,
          dilemma: 'hold',
        },
      ];
      break;
    }
    case 'dilemma_alcohol_curb': {
      base.resolutions = [
        {
          label: 'Ограничить: крепкое — только до 18:00',
          cost: 0,
          note: 'Вечерняя выручка бара просядет, зато инциденты и «пьяные» отзывы прекращаются. Юридический риск −10.',
          dilemma: 'curb_evening',
        },
        {
          label: 'Продолжать как есть',
          cost: 0,
          note: 'Выручка без изменений, но репутация продолжает копить минус: репутационный риск +5, юридический +8.',
          dilemma: 'keep_selling',
        },
      ];
      break;
    }
    default:
      return null;
  }
  return base;
}

/** Мини-дилемма §16.1 (повторный инцидент за квартал) — создаётся weekclose. */
export function createAlcoholCurbEvent(week: number, weekDate: GameDate): GameEvent | null {
  const evt = createDilemmaEvent('dilemma_alcohol_curb', week, weekDate, null as unknown as Restaurant);
  return evt;
}

/* ============================= РЕШЕНИЯ ============================= */

/**
 * Применить ветку дилеммы (из resolveEvent). Возвращает текст-пояснение
 * для тоста игрока. Спец-ветки платят сами (типы транзакций честные).
 */
export function applyDilemmaResolution(
  state: GameState,
  event: GameEvent,
  tag: NonNullable<import('../types').EventResolution['dilemma']>,
): string {
  const r = state.restaurant!;
  const d = BALANCE_V2_5.dilemmas;
  const pe = (r.permanentEffects ??= {});
  const week = state.week;
  const date = event.date;

  switch (tag) {
    case 'chef_accept': {
      // Реальное сокращение карты: 20% наименее популярных блюд.
      const dishes = r.menu.dishes
        .map((id) => dishOf(r.menu, id))
        .filter((dish): dish is Dish => Boolean(dish));
      dishes.sort((a, b) => a.basePopularity - b.basePopularity);
      const cut = Math.max(1, Math.round(dishes.length * 0.2));
      const cutIds = new Set(dishes.slice(0, cut).map((dish) => dish.id));
      r.menu.dishes = r.menu.dishes.filter((id) => !cutIds.has(id));
      r.menu.stopList = r.menu.stopList.filter((id) => !cutIds.has(id));
      pe.chefMenuCut = true;
      return `Меню сокращено на ${cutIds.size} позиций: FC −1 п.п., средний чек −3% — навсегда.`;
    }
    case 'chef_refuse': {
      pe.chefQuitRisk = { mult: d.chefQuitMult, untilWeek: week + d.chefQuitWeeks };
      return `Шеф обижен: увольнения ×${d.chefQuitMult} на ${d.chefQuitWeeks} нед, потом шанс ухода ${Math.round(d.chefQuitChance * 100)}%.`;
    }
    case 'bribe_pay': {
      // Платёж уже проведён generic-веткой resolveEvent (cost) — здесь только флаги.
      pe.bribeFlag = true;
      r.risks.legal = clamp(r.risks.legal - d.bribeLegalDrop, 0, 100);
      return `Инцидент исчерпан (Legal −${d.bribeLegalDrop}), но взятка на виду: скандал ${Math.round(d.bribeScandalYearly * 100)}%/год.`;
    }
    case 'bribe_refuse': {
      pe.hardInspections = true;
      r.risks.legal = clamp(r.risks.legal - d.refuseLegalDrop, 0, 100);
      return `Официально, но жёстче: штрафы ×${d.refuseFineMult} навсегда (Legal −${d.refuseLegalDrop}).`;
    }
    case 'restructure': {
      for (const loan of r.finance.loans) {
        const term = loan.termMonths + d.restructureTermMonths;
        const rate = loan.annualRate + d.restructureRatePP;
        loan.termMonths = term;
        loan.annualRate = Math.round(rate * 1000) / 1000;
        // §15 контракт: платёж −25% (амортизация дальше следует из платежа;
        // честный аннуитет на новых сроке/ставке даёт лишь −15% — фиксируем
        // обещанную цифру, тело гасится медленнее).
        loan.payment = Math.round(loan.payment * d.restructurePaymentMult);
      }
      return 'Кредит растянут: платёж −25%, срок +12 мес, ставка +1,5 п.п.';
    }
    case 'restructure_refuse': {
      pe.creditLimitShare = d.refuseLimitShare;
      return `Дисциплина сохранена, но кредитный лимит урезан до ${Math.round(d.refuseLimitShare * 100)}%.`;
    }
    case 'franchise_accept': {
      pe.franchiseDemand = d.franchiseDemandMult;
      pe.franchiseOwnerShare = d.franchiseOwnerShare;
      return `Франшиза подписана: спрос +${Math.round((d.franchiseDemandMult - 1) * 100)}%, ${Math.round(d.franchiseOwnerShare * 100)}% выручки — сети.`;
    }
    case 'franchise_refuse': {
      pe.prestigeBonus = d.franchisePrestige;
      return `Независимость дороже: престиж +${d.franchisePrestige} к BSC «Клиенты».`;
    }
    case 'raise': {
      pe.wageRaise = d.crisisRaiseMult;
      return `Оклады ×${d.crisisRaiseMult}: текучесть в норме, ФОТ вырос навсегда.`;
    }
    case 'hold': {
      pe.staffCrisis = {
        qFatigueMult: d.crisisQFatigueMult,
        hireMult: d.crisisHireMult,
        untilWeek: week + d.crisisHireWeeks,
      };
      for (const pool of Object.values(r.staff.pools)) {
        pool.morale = clamp(pool.morale - d.crisisMoraleHit, 0, 100);
      }
      return `Держимся: усталость бьёт сильнее (×${d.crisisQFatigueMult}), найм ×${d.crisisHireMult} на ${d.crisisHireWeeks} нед, мораль −${d.crisisMoraleHit}.`;
    }
    case 'curb_evening': {
      pe.alcoholEveningRestrict = true;
      r.risks.legal = clamp(r.risks.legal - 10, 0, 100);
      r.risks.reputation = clamp(r.risks.reputation - 3, 0, 100);
      return 'Крепкое — до 18:00: вечерний бар тише, инциденты прекращаются.';
    }
    case 'keep_selling': {
      r.risks.reputation = clamp(r.risks.reputation + 5, 0, 100);
      r.risks.legal = clamp(r.risks.legal + 8, 0, 100);
      return 'Бар работает как раньше — риски копятся дальше.';
    }
    default:
      return 'Дилемма решена.';
  }
}

/* ============================= ЕЖЕНЕДЕЛЬНЫЕ БРОСКИ ============================= */

/**
 * §13/§15: скандал из-за взятки (5%/год ≈ p/нед = 0.05/52). Отдельный
 * rng-поток 'scandal'. Возвращает событие скандала или null.
 */
export function checkBribeScandal(state: GameState, week: number, weekDate: GameDate): GameEvent | null {
  const r = state.restaurant;
  if (!r || isLegacy() || !r.permanentEffects?.bribeFlag) return null;
  const d = BALANCE_V2_5.dilemmas;
  const rng = deriveRng(hashSeed(state.seed, week), 'scandal');
  if (!rng.chance(d.bribeScandalYearly / 52)) return null;
  // Скандал: штраф 300–500 тыс, репутационный удар через риск + волна
  // негатива (событие применяет эффекты само — как normal).
  const fine = 300_000 + Math.round(rng.next() * 200_000);
  const event: GameEvent = {
    id: `evt-bribe_scandal-${week}`,
    date: { ...weekDate },
    templateId: 'bribe_scandal',
    title: 'Скандал: взятка всплыла',
    description:
      'Бывший инспектор дал показания: ваша «благодарность» в его отчёте. Возбуждено дело ' +
      'о мелком взяточничестве: штраф, упоминание в СМИ, волна насмешек в отзывах.',
    criticality: 'normal',
    effect: { cash: -fine, riskDelta: { reputation: 20, legal: 15 } },
    resolved: false,
  };
  return event;
}

/**
 * §15: уход шефа после отказа (окно ×1,5 истекло → шанс 40%). Поток
 * 'chef-quit'. Возвращает крит-событие с платным наймом нового шефа.
 */
export function checkChefQuit(state: GameState, week: number, weekDate: GameDate): GameEvent | null {
  const r = state.restaurant;
  if (!r || isLegacy()) return null;
  const w = r.permanentEffects?.chefQuitRisk;
  if (!w) return null;
  if (week <= w.untilWeek) return null;
  const d = BALANCE_V2_5.dilemmas;
  const rng = deriveRng(hashSeed(state.seed, week), 'chef-quit');
  // Бросок совершается ОДИН раз — окно удаляется независимо от исхода.
  delete (r.permanentEffects ??= {}).chefQuitRisk;
  if (!rng.chance(d.chefQuitChance)) return null;
  applyQuit(r, 'head_chef');
  // v2 §15 «Кризис» (отказ): хедхантинг шефа тоже дорожает ×1,5 в окне.
  const hiringCost = Math.round(BALANCE_V2_2.quit.hiringCost * hireCostMult(r, week));
  const event: GameEvent = {
    id: `evt-chef_quit-${week}`,
    date: { ...weekDate },
    templateId: 'staff_resignation',
    title: 'Шеф-повар ушёл',
    description:
      'Обещанный уход состоялся: «Я предлагал собрать кухню — меня не услышали». Увольнение ' +
      'по собственному, неделю до последней смены. Кухня без главы: качество и скорость просядут.',
    criticality: 'critical',
    effect: {},
    resolved: false,
    resolutions: [
      {
        label: `Найти нового шефа — подбор ${hiringCost.toLocaleString('ru-RU')} ₽`,
        cost: hiringCost,
        note: 'Хедхантинг: новый шеф со следующего дня, 7 дней адаптации (КПД 0.70→0.85).',
        hire: { roleId: 'head_chef' },
      },
      {
        label: 'Оставить вакансию открытой',
        cost: 0,
        note: 'Экономия сейчас: качество блюд и организация кухни падают, станциям труднее держать темп.',
      },
    ],
  };
  return event;
}

/**
 * ДИЛЕММЫ (БАЛ-v2 §15, порт из v1.0.0): тяжёлые развилки ОТ СОСТОЯНИЯ,
 * не чаще 1/квартал, эффекты «до конца игры» (permanentEffects).
 *
 * Детерминизм §21: триггеры чисто пороговые (без ГСЧ); редкие броски
 * (скандал взятки, уход шефа) — ОТДЕЛЬНЫЕ rng-потоки, существующие
 * сценарии дня не сдвигаются. Дилемма замещает одно обычное событие
 * недели (бюджет пула не растёт).
 */
import type { Dish, GameDate, GameEvent, GameState, Restaurant } from '../types';
import { EVENT_TEMPLATES_MAP } from '../config/risks.config';
import { STAFF_ROLES, ROLE_IDS } from '../config/staffRoles.config';
import { DILEMMAS } from '../config/dilemmas.config';
import { dishOf } from '../content/resolve';
import { deriveRng, hashSeed } from '../rng';
import { clamp } from './core';
import { averageFatigue } from './staff';
import { leverageOf } from './permanent';

/* ============================= ТРИГГЕРЫ ============================= */

interface DilemmaCandidate {
  templateId: string;
  /** Нормализованное давление: насколько состояние выше порога. */
  pressure: number;
}

/**
 * Проверка триггеров дилемм на закрытии недели. Возвращает событие-дилемму
 * ИЛИ null. Побочно обновляет окна (fatigueHighWeeks/ratingHighWeeks/
 * leverageHighWeeks) и замещает одно обычное событие недели.
 *
 * v9: приоритет — кризисные триггеры → «Франшиза» → РУТИННАЯ дилемма
 * (бытовая развилка менеджера для здоровой игры, раз в ~10 нед).
 */
export function checkDilemmas(state: GameState, week: number, weekDate: GameDate): GameEvent | null {
  const restaurant = state.restaurant;
  if (!restaurant) return null;
  if (DILEMMAS.perQuarter <= 0) return null;
  // Минимальный разрыв между ЛЮБЫМИ дилеммами (v9 — 10 нед): рутина
  // приходит и в здоровой игре, кризисные — как раньше, чуть чаще квартала.
  const last = restaurant.lastDilemmaWeek ?? 0;
  if (last > 0 && week - last < DILEMMAS.routineMinGap) return null;
  // Дилемма уже висит неразрешённой — не дублируем.
  if (state.activeEvents.some((e) => e.templateId.startsWith('dilemma_') && !e.resolved)) return null;

  // Окна триггеров (обновляются каждую неделю — counters в Restaurant).
  const fatigue = averageFatigue(restaurant.staff);
  restaurant.fatigueHighWeeks =
    fatigue > DILEMMAS.fatigueAvg ? (restaurant.fatigueHighWeeks ?? 0) + 1 : 0;
  restaurant.ratingHighWeeks =
    restaurant.reputation.rating > DILEMMAS.rating ? (restaurant.ratingHighWeeks ?? 0) + 1 : 0;
  // Окно стабильности плеча: L > 1 ДВЕ недели подряд — свежий кредит визарда
  // не должен звать банк в первую же неделю; устойчивая нагрузка — зовёт.
  const leverage = leverageOf(restaurant);
  restaurant.leverageHighWeeks = leverage > DILEMMAS.leverage ? (restaurant.leverageHighWeeks ?? 0) + 1 : 0;

  const candidates: DilemmaCandidate[] = [];
  if ((restaurant.fatigueHighWeeks ?? 0) >= DILEMMAS.fatigueWeeks) {
    candidates.push({
      templateId: 'dilemma_chef_menu',
      pressure: (fatigue - DILEMMAS.fatigueAvg) * 2 + (restaurant.fatigueHighWeeks ?? 0),
    });
  }
  if (restaurant.risks.legal > DILEMMAS.legalRisk) {
    candidates.push({ templateId: 'dilemma_inspector_bribe', pressure: restaurant.risks.legal - DILEMMAS.legalRisk });
  }
  if ((restaurant.leverageHighWeeks ?? 0) >= 2 && restaurant.finance.loans.length > 0) {
    candidates.push({ templateId: 'dilemma_bank_restructure', pressure: (leverage - DILEMMAS.leverage) * 40 });
  }
  // «Кадровый кризис»: оценка текучести из кадрового риска (модель BSC).
  const turnover = Math.min(0.6, Math.max(0.05, restaurant.risks.staff / 160));
  if (turnover > DILEMMAS.turnover) {
    candidates.push({ templateId: 'dilemma_staff_crisis', pressure: (turnover - DILEMMAS.turnover) * 100 });
  }
  // «Франшиза» — позитивный триггер: только если остальных нет.
  let franchiseOk = false;
  if (
    candidates.length === 0 &&
    (restaurant.ratingHighWeeks ?? 0) >= DILEMMAS.ratingWeeks &&
    restaurant.reputation.rating > DILEMMAS.rating
  ) {
    franchiseOk = true;
  }

  // РУТИННАЯ дилемма (v9): здоровая игра тоже должна видеть развилки.
  // Выбор — ротация по календарю (детерминировано, без ГСЧ), из доступных:
  // индексация доступна до потолка ×wageIndexCap, доставка — один раз.
  let routinePool: string[] = [];
  if (candidates.length === 0 && !franchiseOk && week >= DILEMMAS.routineStartWeek) {
    if ((restaurant.permanentEffects?.wageRaise ?? 1) < DILEMMAS.wageIndexCap) {
      routinePool.push('dilemma_wage_index');
    }
    if (restaurant.permanentEffects?.deliveryShare == null) {
      routinePool.push('dilemma_delivery_app');
    }
  }

  let templateId: string;
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.pressure - a.pressure);
    templateId = candidates[0].templateId;
  } else if (franchiseOk) {
    templateId = 'dilemma_franchise';
  } else if (routinePool.length > 0) {
    templateId = routinePool[Math.floor(week / DILEMMAS.routineMinGap) % routinePool.length];
  } else {
    return null;
  }

  const event = createDilemmaEvent(templateId, week, weekDate, restaurant);
  if (!event) return null;

  // Замещение: убираем одно обычное НЕразрешённое событие этой же недели
  // (бюджет пула событий не растёт — §15). Замещаем только шаблонные события
  // пула (системные события — дивиденды/арендодатель/дилеммы — не трогаем).
  const replaceIdx = state.activeEvents.findIndex(
    (e) =>
      e.date.week === week &&
      !e.resolved &&
      !e.templateId.startsWith('dilemma_') &&
      EVENT_TEMPLATES_MAP[e.templateId] != null,
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
  const d = DILEMMAS;
  const base: GameEvent = {
    id: `evt-${templateId}-${week}`,
    date: { ...weekDate },
    templateId,
    title: templateId,
    description: '',
    criticality: 'critical',
    effect: {},
    resolved: false,
  };

  switch (templateId) {
    case 'dilemma_chef_menu': {
      base.title = 'Шеф просит пересобрать карту';
      base.description =
        'Шеф устал гонять 30+ позиций: «Половину карты заказывают раз в неделю, зато готовим всё. ' +
        'Сократите карту на 20% — порции стандартизируются, качество выровняется, кухня задышит». ' +
        'Сокращать — значит прощаться с чеком редких позиций.';
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
      base.title = 'Инспектор намекает на «благодарность»';
      base.description =
        'Проверка нашла нарушения, но инспектор не торопится с протоколом: «Можно оформить по-минимуму, ' +
        'можно — по-максимуму. Зависит от обстоятельств». Взятка решит вопрос сегодня — и повисит навсегда.';
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
      base.title = 'Банк предлагает реструктуризацию';
      base.description =
        'Кредитный специалист звонит сам — редкость: «Видим нагрузку. Можем растянуть кредит: ' +
        'платёж станет меньше, но переплата вырастет. Либо держим дисциплину — но лимит урежем».';
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
      base.title = 'Сеть предлагает франшизу';
      base.description =
        'Успех замечен: сеть casual-dining предлагает франшизу — их бренд, их стандарты, ' +
        'их маркетинг. Ваш рейтинг станет их активом, а вы — оператором с роялти.';
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
          (s, roleId) =>
            s +
            (restaurant.staff.pools[roleId]?.count ?? 0) *
              (STAFF_ROLES[roleId].monthlySalary / 4.33),
          0,
        ),
      );
      base.title = 'Кадровый кризис: зарплаты или терпеть';
      base.description =
        'Команда выгорает и присматривает вакансии у соседей: «Пока вы считаете Food Cost, ' +
        'мы считаем, где платить больше». Рынок труда сейчас не в вашу пользу.';
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
          note: `Экономия сейчас, счёт потом: усталость растёт быстрее (×${d.crisisQFatigueMult}), мораль −${d.crisisMoraleHit}, подбор персонала дороже ×${d.crisisHireMult} на ${d.crisisHireWeeks} нед.`,
          dilemma: 'hold',
        },
      ];
      break;
    }
    case 'dilemma_wage_index': {
      const payrollWeekly = Math.round(
        ROLE_IDS.reduce(
          (s, roleId) =>
            s +
            (restaurant.staff.pools[roleId]?.count ?? 0) *
              (STAFF_ROLES[roleId].monthlySalary / 4.33),
          0,
        ),
      );
      base.title = 'Команда просит индексацию зарплат';
      base.description =
        'Старшая смена озвучила просьбу коллектива: «Продукты и проезд подорожали, оклады не трогали с ' +
        'открытия. Просим индексацию 8% — иначе люди начнут смотреть по сторонам». Инфляция съедает ' +
        'реальные зарплаты — и рыночный кадровый рынок это знает.';
      base.resolutions = [
        {
          label: 'Индексировать оклады на 8%',
          cost: 0,
          note: `ФОТ +${Math.round(payrollWeekly * (d.wageIndexMult - 1)).toLocaleString('ru-RU')} ₽/нед — навсегда (потолок индексаций ×${d.wageIndexCap}). Мораль команды +${d.wageIndexMorale}.`,
          dilemma: 'wage_accept',
        },
        {
          label: 'Отказать: оклады остаются',
          cost: 0,
          note: `Экономия сегодня — счёт завтра: мораль −${d.wageRefuseMoraleHit}, риск увольнений ×${d.wageRefuseQuitMult} на ${d.wageRefuseQuitWeeks} нед.`,
          dilemma: 'wage_refuse',
        },
      ];
      break;
    }
    case 'dilemma_delivery_app': {
      base.title = 'Агрегатор доставки зовёт на площадку';
      base.description =
        'Менеджер платформы доставки: «Подключайте ресторан: заказы из квартир и офисов рядом, готовите в ' +
        'том же цеху. Комиссия — как у всех площадок». Кухня получит вечерний поток без единого гостя в зале.';
      base.resolutions = [
        {
          label: 'Подписать договор с площадкой',
          cost: 0,
          note: `Спрос +${Math.round((d.deliveryDemandMult - 1) * 100)}% навсегда. Комиссия ${Math.round(d.deliveryShare * 100)}% всей выручки — каждую неделю, навсегда. Считайте экономику ДО подписи.`,
          dilemma: 'delivery_accept',
        },
        {
          label: 'Остаться офлайн-рестораном',
          cost: 0,
          note: `Репутация места, куда приходят лично: престиж +${d.deliveryPrestige} к перспективе «Клиенты» BSC.`,
          dilemma: 'delivery_refuse',
        },
      ];
      break;
    }
    default:
      return null;
  }
  return base;
}

/* ============================= РЕШЕНИЯ ============================= */

/**
 * Применить ветку дилеммы (из resolveEvent). Возвращает текст-пояснение
 * для тоста игрока. Спец-ветки платят сами (типы транзакций честные).
 */
export function applyDilemmaResolution(
  state: GameState,
  event: GameEvent,
  tag: string,
): string {
  const r = state.restaurant!;
  const d = DILEMMAS;
  const pe = (r.permanentEffects ??= {});
  const week = state.week;

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
        // §15 контракт: платёж −25% (тело гасится медленнее — честный
        // аннуитет на новых сроке/ставке даёт лишь −15%, фиксируем обещание).
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
      return `Держимся: усталость растёт быстрее (×${d.crisisQFatigueMult}), найм ×${d.crisisHireMult} на ${d.crisisHireWeeks} нед, мораль −${d.crisisMoraleHit}.`;
    }
    /* ===== РУТИННЫЕ ДИЛЕММЫ (v9) ===== */
    case 'wage_accept': {
      const next = Math.min(d.wageIndexCap, (pe.wageRaise ?? 1) * d.wageIndexMult);
      pe.wageRaise = Math.round(next * 1000) / 1000;
      for (const pool of Object.values(r.staff.pools)) {
        if (pool.count > 0) pool.morale = clamp(pool.morale + d.wageIndexMorale, 0, 100);
      }
      return `Оклады проиндексированы (×${next.toFixed(2)}): ФОТ вырос навсегда, мораль +${d.wageIndexMorale}.`;
    }
    case 'wage_refuse': {
      for (const pool of Object.values(r.staff.pools)) {
        if (pool.count > 0) pool.morale = clamp(pool.morale - d.wageRefuseMoraleHit, 0, 100);
      }
      const prev = pe.chefQuitRisk;
      pe.chefQuitRisk = {
        mult: Math.max(prev?.mult ?? 1, d.wageRefuseQuitMult),
        untilWeek: Math.max(prev?.untilWeek ?? 0, week + d.wageRefuseQuitWeeks),
      };
      return `Без индексации: мораль −${d.wageRefuseMoraleHit}, увольнения ×${d.wageRefuseQuitMult} на ${d.wageRefuseQuitWeeks} нед.`;
    }
    case 'delivery_accept': {
      pe.franchiseDemand = Math.round((pe.franchiseDemand ?? 1) * d.deliveryDemandMult * 1000) / 1000;
      pe.deliveryShare = Math.round(((pe.deliveryShare ?? 0) + d.deliveryShare) * 1000) / 1000;
      return `Доставка подключена: спрос +${Math.round((d.deliveryDemandMult - 1) * 100)}%, комиссия ${Math.round(d.deliveryShare * 100)}% выручки каждую неделю.`;
    }
    case 'delivery_refuse': {
      pe.prestigeBonus = (pe.prestigeBonus ?? 0) + d.deliveryPrestige;
      return `Офлайн-ресторан: престиж +${d.deliveryPrestige} к BSC «Клиенты».`;
    }
    default:
      return 'Дилемма решена.';
  }
}

/* ============================= ЕЖЕНЕДЕЛЬНЫЕ БРОСКИ ============================= */

/**
 * §13/§15: скандал из-за взятки (5%/год ≈ p/нед = 0,05/52). Отдельный
 * rng-поток 'scandal'. Возвращает событие скандала или null.
 */
export function checkBribeScandal(state: GameState, week: number, weekDate: GameDate): GameEvent | null {
  const r = state.restaurant;
  if (!r || !r.permanentEffects?.bribeFlag) return null;
  const d = DILEMMAS;
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
  if (!r) return null;
  const w = r.permanentEffects?.chefQuitRisk;
  if (!w) return null;
  if (week <= w.untilWeek) return null;
  const d = DILEMMAS;
  const rng = deriveRng(hashSeed(state.seed, week), 'chef-quit');
  // Бросок совершается ОДИН раз — окно удаляется независимо от исхода.
  delete (r.permanentEffects ??= {}).chefQuitRisk;
  if (!rng.chance(d.chefQuitChance)) return null;
  const pool = r.staff.pools.head_chef;
  if (pool && pool.count > 0) pool.count -= 1;
  // Хедхантинг шефа дорожает в окне кадрового кризиса (если активен).
  const hiringCost = Math.round(30_000 * (r.permanentEffects?.staffCrisis && week <= r.permanentEffects.staffCrisis.untilWeek ? r.permanentEffects.staffCrisis.hireMult : 1));
  const event: GameEvent = {
    id: `evt-chef_quit-${week}`,
    date: { ...weekDate },
    templateId: 'chef_quit',
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
        note: 'Хедхантинг: новый шеф со следующего дня, 7 дней адаптации (КПД ниже нормы).',
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

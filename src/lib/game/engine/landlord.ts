/**
 * ЦЕПОЧКА АРЕНДОДАТЕЛЯ (docs/BALANCING-V2.md §6, этап 1).
 *
 * Механика:
 *  1. Квартальная индексация договора: RentQ = Rent0 × (1 + i)^Q — применяется
 *     в weekclose.ts при закрытии недели (поле rentMonthly пересчитывается).
 *     Хорошие отношения (≥80) дают −0,5 п.п. к индексу.
 *  2. Разговор с арендодателем ~раз в год (первый — случайная неделя 8–23):
 *     предложение шага +s с компенсацией (мелкий ремонт фасада).
 *  3. Отказ → relation −20, следующий разговор через 16 нед с шагом s×1,5
 *     без компенсации; второй отказ → через 8 нед УЛЬТИМАТУМ:
 *     принять +10% (mod) / +12% (agr) навсегда ИЛИ переезд.
 *  4. Переезд (решение заказчика №3 — всегда «с сохранением» улучшений):
 *     2 млн ₽ + 3 недели спрос ×0,75 + аренда = база ×1,10; оборудование,
 *     лицензии и ремонт НЕ теряются.
 *
 * Событие создаётся ЗДЕСЬ как критическое с ДИНАМИЧЕСКИМИ resolutions
 * (GameEvent.resolutions приоритетнее шаблона — см. resolveEvent в setup.ts).
 */
import type { GameEvent, GameState, LandlordState, Restaurant } from '../types';
import { BALANCE_V2, isLegacy, rentQuarterlyIndex } from '../config/balance2.config';
import { addTransaction } from './core';
import { clamp } from './core';
import type { Rng } from '../rng';

export function initLandlordState(rentBase: number, rng: Rng): LandlordState {
  return {
    relation: BALANCE_V2.rent.relationStart,
    refusals: 0,
    nextTalkWeek: isLegacy() ? 0 : 8 + Math.floor(rng.next() * 16),
    rentBase,
    stepSum: 0,
  };
}

/** Текущая месячная аренда: база × (1+i)^кварталов × (1 + сумма шагов). */
export function currentRentMonthly(restaurant: Restaurant, week: number): number {
  if (isLegacy()) return restaurant.rentMonthly;
  const l = restaurant.landlord;
  if (!l) return restaurant.rentMonthly;
  const quarters = Math.floor(Math.max(0, week - 1) / 13);
  const idx = Math.pow(1 + rentQuarterlyIndex(l.relation), quarters);
  return Math.round(l.rentBase * idx * (1 + l.stepSum));
}

/** Шаг для следующего предложения (первое s, повторное s×1,5). */
function offerStep(refusals: number): number {
  const s = BALANCE_V2.rent.eventStep;
  return refusals >= 1 ? s * BALANCE_V2.rent.repeatStepMultiplier : s;
}

/** Проверка расписания разговоров (вызывается из closeWeek). */
export function checkLandlordSchedule(state: GameState, week: number, rng: Rng): GameEvent | null {
  if (isLegacy()) return null;
  const r = state.restaurant;
  if (!r || !r.landlord) return null;
  const l = r.landlord;
  if (l.nextTalkWeek <= 0 || week < l.nextTalkWeek) return null;
  const ev = l.refusals >= 2 ? buildUltimatum(state, week) : buildOffer(state, week);
  // Пока диалог открыт — новых разговоров не назначаем; следующий назначается
  // в applyLandlordResolution (принять/отказаться/переезд).
  l.nextTalkWeek = 0;
  state.activeEvents.push(ev);
  return ev;
}

/** Предложение индексации (первое — с компенсацией, повторное — без). */
function buildOffer(state: GameState, week: number): GameEvent {
  const l = state.restaurant!.landlord;
  const step = offerStep(l.refusals);
  const repeat = l.refusals >= 1;
  const rentNow = currentRentMonthly(state.restaurant!, week);
  const rentAfter = Math.round(rentNow * (1 + step));
  const pct = Math.round(step * 100);
  const note = repeat
    ? `Аренда вырастет с ${rentNow.toLocaleString('ru-RU')} до ${rentAfter.toLocaleString('ru-RU')} ₽/мес — без компенсаций. Отказ ещё раз — и арендодатель перейдёт к угрозам.`
    : `Аренда вырастет с ${rentNow.toLocaleString('ru-RU')} до ${rentAfter.toLocaleString('ru-RU')} ₽/мес. Взамен арендодатель за свой счёт освежит фасад (износ зала −5).`;
  return {
    id: `evt-landlord-${repeat ? 'repeat' : 'offer'}-${week}`,
    date: { week, day: 6, hour: 22 },
    templateId: 'landlord_offer',
    title: repeat ? 'Арендодатель настаивает на индексации' : 'Арендодатель предлагает пересмотр договора',
    description: repeat
      ? 'Второй визит за год: «В прошлый раз вы отказались, но рынок ушёл вверх. Последнее разумное предложение — иначе я не могу держать эту ставку».'
      : 'Арендодатель пришёл с отчётом по рынку: «Ставки по району выросли. Предлагаю пересмотреть договор — я компенсирую неудобства ремонтом фасада».',
    criticality: 'critical',
    effect: {},
    resolved: false,
    resolutions: [
      {
        label: `Согласиться на +${pct}%`,
        cost: 0,
        note,
        landlord: 'accept',
      },
      {
        label: 'Отказаться',
        cost: 0,
        note: `Отношения с арендодателем ухудшатся (−${BALANCE_V2.rent.refusalRelation}). Он вернётся с более жёстким предложением.`,
        landlord: 'refuse',
      },
    ],
  };
}

/** Ультиматум после двух отказов. */
function buildUltimatum(state: GameState, week: number): GameEvent {
  const l = state.restaurant!.landlord;
  const step = BALANCE_V2.rent.ultimatumStep;
  const rentNow = currentRentMonthly(state.restaurant!, week);
  const rentAfter = Math.round(rentNow * (1 + step));
  const rentRelocated = Math.round(l.rentBase * BALANCE_V2.rent.relocationRentFactor);
  const pct = Math.round(step * 100);
  return {
    id: `evt-landlord-ultimatum-${week}`,
    date: { week, day: 6, hour: 22 },
    templateId: 'landlord_ultimatum',
    title: 'Ультиматум арендодателя',
    description:
      '«Вы дважды отказались. Больше уговаривать не буду: либо новая ставка, либо ищите другое помещение. Переезд — ваши расходы, ваш простой и ваши нервы».',
    criticality: 'critical',
    effect: {},
    resolved: false,
    resolutions: [
      {
        label: `Принять +${pct}% навсегда`,
        cost: 0,
        note: `Аренда вырастет с ${rentNow.toLocaleString('ru-RU')} до ${rentAfter.toLocaleString('ru-RU')} ₽/мес — окончательно.`,
        landlord: 'accept_ultimatum',
      },
      {
        label: 'Переехать в новое помещение',
        cost: 0,
        note: `2 млн ₽ на переезд и ремонт, 3 недели спрос −25%, аренда от базы ${rentRelocated.toLocaleString('ru-RU')} ₽/мес. Оборудование, лицензии и ремонт сохраняются.`,
        landlord: 'relocate',
      },
    ],
  };
}

/**
 * Применение решения (вызывается из resolveEvent после стандартных эффектов).
 * Возвращает заметку для игрока.
 */
export function applyLandlordResolution(
  state: GameState,
  action: 'accept' | 'refuse' | 'accept_ultimatum' | 'relocate',
  week: number,
): string {
  const r = state.restaurant!;
  const l = r.landlord;
  const cfg = BALANCE_V2.rent;

  switch (action) {
    case 'accept': {
      const wasRepeat = l.refusals >= 1; // компенсация только за первое предложение
      l.stepSum += offerStep(l.refusals);
      l.refusals = 0;
      l.relation = clamp(l.relation + cfg.acceptRelation, 0, 100);
      l.nextTalkWeek = week + 52; // следующий разговор — не в этом году
      if (!wasRepeat) {
        // Ремонт фасада арендодателем: износ зала −5.
        r.equipment.hall.wear = clamp(r.equipment.hall.wear - 5, 0, 100);
      }
      r.rentMonthly = currentRentMonthly(r, week);
      return `Договор подписан: аренда ${r.rentMonthly.toLocaleString('ru-RU')} ₽/мес${wasRepeat ? '' : ', фасад освежат за счёт арендодателя'}, отношения улучшаются.`;
    }
    case 'refuse': {
      l.refusals += 1;
      l.relation = clamp(l.relation - cfg.refusalRelation, 0, 100);
      l.nextTalkWeek = week + (l.refusals >= 2 ? cfg.ultimatumIn : cfg.refuseNextIn);
      return l.refusals >= 2
        ? `Отказ принят холодно. Ультиматума ждать через ${cfg.ultimatumIn} недель.`
        : `Отказ принят. Арендодатель вернётся через ${cfg.refuseNextIn} недель с более жёстким предложением.`;
    }
    case 'accept_ultimatum': {
      l.stepSum += cfg.ultimatumStep;
      l.refusals = 0;
      l.relation = clamp(l.relation + 5, 0, 100);
      l.nextTalkWeek = week + 52;
      r.rentMonthly = currentRentMonthly(r, week);
      return `Ультиматум принят: аренда ${r.rentMonthly.toLocaleString('ru-RU')} ₽/мес — окончательно.`;
    }
    case 'relocate': {
      // Решение заказчика №3: переезд всегда «с сохранением» улучшений —
      // оборудование, лицензии, уровень ремонта не трогаем.
      const cost = cfg.relocationCost;
      if (r.finance.cash < cost) {
        // Нет денег на переезд — принудительно принимаем ультиматум.
        l.stepSum += cfg.ultimatumStep;
        l.refusals = 0;
        l.nextTalkWeek = week + 52;
        r.rentMonthly = currentRentMonthly(r, week);
        return 'Денег на переезд не хватило — пришлось принять ультиматум.';
      }
      addTransaction(r, { week, day: 6, hour: 22 }, 'other', cost, 'out', 'Переезд: логистика, ремонт, простой');
      // v2 §20 (этап 6): факт переезда виден в финале (спец-финал «Переезд»).
      state.history.relocations = (state.history.relocations ?? 0) + 1;
      // 3 недели просадки спроса — отдельное синтетическое событие
      // (механизм demandBoost уже поддерживается demand.ts).
      state.activeEvents.push({
        id: `evt-relocation-downturn-${week}`,
        date: { week, day: 6, hour: 22 },
        templateId: 'relocation_downturn',
        title: 'Простой после переезда',
        description: 'Новые стены, старые гости: добраться до нового адреса им только предстоит.',
        criticality: 'normal',
        effect: { demandBoost: cfg.relocationDemandFactor, demandBoostWeeks: cfg.relocationDemandWeeks },
        resolved: true,
      });
      l.rentBase = Math.round(l.rentBase * cfg.relocationRentFactor);
      l.stepSum = 0;
      l.refusals = 0;
      l.relation = 50; // новый арендодатель — нейтральные отношения
      l.nextTalkWeek = week + 52;
      r.rentMonthly = currentRentMonthly(r, week);
      return `Переезд состоялся: аренда ${r.rentMonthly.toLocaleString('ru-RU')} ₽/мес, 3 недели спрос −25%, улучшения сохранены.`;
    }
    default:
      return '';
  }
}

/** Справочно: аренда до/после индексации (для UI и тестов). */
export function rentIndexationInfo(restaurant: Restaurant, week: number): { base: number; current: number; quarters: number } {
  const l = restaurant.landlord;
  if (!l) return { base: restaurant.rentMonthly, current: restaurant.rentMonthly, quarters: 0 };
  return {
    base: l.rentBase,
    current: currentRentMonthly(restaurant, week),
    quarters: Math.floor(Math.max(0, week - 1) / 13),
  };
}

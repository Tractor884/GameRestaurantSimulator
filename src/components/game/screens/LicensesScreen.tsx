/**
 * Экран «Лицензии» (ТЗ §31.4 п.11): алкогольная лицензия, сезонная веранда,
 * санитарная обработка.
 *
 * 26-b: веранда — СЕЗОННАЯ лицензия: разрешение покупается с апреля,
 * работает со следующего после покупки месяца по сентябрь, в октябре
 * обязателен демонтаж (кнопка здесь + критическое событие veranda_teardown).
 */
'use client';

import type { ReactNode } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, MetricRow, money } from '../widgets';
import { ALCOHOL_LICENSE, VERANDA } from '@/lib/game/config/premises.config';
import { CLEANING } from '@/lib/game/config/marketing.config';
import { monthOfDay, dayOfYear, MONTHS_RU, MONTHS_RU_GEN, MONTHS_RU_PREP } from '@/lib/game/config/demandProfiles.config';
import { verandaSeasonMonths } from '@/lib/game/engine';
import { dishOf } from '@/lib/game/content/resolve';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  FileCheck,
  Sun,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Hammer,
  XCircle,
} from 'lucide-react';

export function LicensesScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const license = useGame((s) => s.license);
  const deepClean = useGame((s) => s.deepClean);
  const disabled = state.phase === 'gameover';

  const alcohol = restaurant.licenses.alcohol;
  const alcoholActive = !!alcohol?.active;
  const alcoholDishesInMenu = restaurant.menu.dishes.filter(
    (id) => dishOf(restaurant.menu, id)?.requiresAlcoholLicense,
  ).length;

  return (
    <div className="space-y-4">
      {/* Алкогольная лицензия */}
      <SectionCard title="Лицензия на алкоголь" icon={FileCheck}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {alcoholActive ? (
                <>
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Активна
                  </Badge>
                  {alcohol?.paidUntil && (
                    <span className="text-sm text-stone-600">
                      до конца недели {alcohol.paidUntil.week}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Нет лицензии
                  </Badge>
                  <span className="text-sm text-stone-600">алкоголь не продаётся</span>
                </>
              )}
            </div>
            <MetricRow
              label="Стоимость (год)"
              value={money(ALCOHOL_LICENSE.annualCost)}
              hint="Амортизируется в P&L: годовая сумма равномерно по неделям"
            />
            <MetricRow
              label="Юридический риск"
              value={alcoholActive ? `−${ALCOHOL_LICENSE.legalRiskReduction} п.` : 'растёт'}
              hint="Лицензия снижает юридический риск на 15 пунктов"
              tone={alcoholActive ? 'good' : 'bad'}
            />
            <MetricRow
              label="Алкоголь в меню"
              value={`${alcoholDishesInMenu} поз.`}
              hint="Требуют лицензии, иначе продаж нет"
            />
          </div>
          <div className="space-y-3">
            <div
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
              <p>
                {alcoholActive
                  ? 'Лицензия активна: алкогольные позиции продаются, юридический риск снижен. Амортизация лицензии уже учитывается в P&L.'
                  : 'Без лицензии движок блокирует продажи алкоголя: позиции меню не приносят выручки, а юридический риск растёт. Продажа «в серую» обернётся штрафами и репутационными событиями.'}
              </p>
            </div>
            {!alcoholActive && (
              <Button
                className="h-11 w-full bg-amber-600 hover:bg-amber-700 text-white"
                onClick={license}
                disabled={disabled}
              >
                <FileCheck className="h-4 w-4 mr-1.5" aria-hidden />
                Купить на год — {money(ALCOHOL_LICENSE.annualCost)}
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Веранда (26-b: сезонная лицензия) */}
      <VerandaSection disabled={disabled} />

      {/* Санитария */}
      <SectionCard title="Сертификаты и санитарная обработка" icon={ShieldAlert}>
        <div className="grid md:grid-cols-2 gap-x-8 items-start">
          <div>
            <MetricRow
              label="Чистота сейчас"
              value={`${restaurant.cleanliness.toFixed(0)}/100`}
              tone={
                restaurant.cleanliness >= 70 ? 'good' : restaurant.cleanliness >= 50 ? 'neutral' : 'bad'
              }
            />
            <MetricRow
              label="Санитарный риск"
              value={`${restaurant.risks.sanitary.toFixed(0)}/100`}
              tone={restaurant.risks.sanitary < 35 ? 'good' : 'bad'}
            />
            <MetricRow
              label="Бюджет клининга"
              value={`${money(restaurant.marketing.cleaningBudget)}/нед`}
              hint="Регулируется на экране «Маркетинг»"
            />
          </div>
          <div className="space-y-3">
            <div
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
              <p>
                Просроченные партии на складе и грязный зал повышают санитарный риск: ждите
                проверки Роспотребнадзора и жалоб на отравление. Генеральная уборка резко снижает
                риск перед визитом инспектора.
              </p>
            </div>
            <Button
              className="h-11 w-full bg-amber-600 hover:bg-amber-700 text-white"
              onClick={deepClean}
              disabled={disabled}
              title={`+${CLEANING.deepCleaningEffect} чистоты за ${money(CLEANING.deepCleaningCost)}`}
            >
              <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
              Генеральная уборка — {money(CLEANING.deepCleaningCost)}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ====================== ЛЕТНЯЯ ВЕРАНДА: СЕЗОННАЯ ЛИЦЕНЗИЯ (26-b) ====================== */

/** Таймлайн-полоска: апрель … октябрь. */
const VERANDA_TIMELINE_MONTHS = [4, 5, 6, 7, 8, 9, 10];

function monthShort(m: number): string {
  const name = MONTHS_RU[m - 1] ?? '';
  return name.slice(0, 1).toUpperCase() + name.slice(1, 3);
}

function VerandaSection({ disabled }: { disabled: boolean }) {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const buyVeranda = useGame((s) => s.buyVeranda);
  const dismantle = useGame((s) => s.dismantleVeranda);

  const month = monthOfDay(dayOfYear(state.week, state.day));
  const permit = restaurant.licenses.veranda;
  const cash = restaurant.finance.cash;
  const removalMonth = VERANDA.seasonLastMonth + 1; // октябрь
  const boughtMonth = permit?.boughtMonth ?? 0;
  const workMonths = permit ? verandaSeasonMonths(boughtMonth) : 0;
  const openFromMonth = Math.min(12, boughtMonth + 1);
  // Полных рабочих месяцев осталось открытой веранде (май→5 … сентябрь→1).
  const monthsLeft =
    month >= VERANDA.seasonLastMonth + 1 ? 0 : VERANDA.seasonLastMonth - Math.max(month, openFromMonth) + 1;

  // ===== Статус (приоритет: испорчена → демонтирована → просрочка → открыта → ждёт → нет) =====
  let badge: ReactNode;
  let statusText: string;
  if (permit?.spoiled) {
    badge = (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden />
        Испорчена
      </Badge>
    );
    statusText = `Мебель и оборудование погибли под дождём и заморозками (−${Math.round(VERANDA.spoilageCost / 1000)} тыс ₽, юр. риск +${VERANDA.lateLegalRisk})`;
  } else if (permit?.removed) {
    badge = (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
        Демонтирована
      </Badge>
    );
    statusText = `Веранда убрана${permit.removedWeek ? ` (неделя ${permit.removedWeek})` : ''} — мебель и оборудование сохранены до следующего сезона`;
  } else if (permit && month >= removalMonth) {
    badge = (
      <Badge className="bg-red-600 text-white hover:bg-red-600">
        <AlertTriangle className="h-3.5 w-3.5 mr-1" aria-hidden />
        СРОЧНО: сезон закрыт
      </Badge>
    );
    statusText = `Демонтируйте веранду до порчи: дожди и заморозки портят мебель, юридический риск +${VERANDA.lateLegalPerWeek} каждую неделю`;
  } else if (restaurant.verandaActive) {
    badge = (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
        Открыта
      </Badge>
    );
    statusText = `+${restaurant.verandaSeats} мест · до конца сентября (${monthsLeft} ${monthsLeft === 1 ? 'полный месяц' : 'полных месяцев'} осталось)`;
  } else if (permit) {
    badge = (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
        <Sun className="h-3.5 w-3.5 mr-1" aria-hidden />
        Разрешение получено
      </Badge>
    );
    statusText =
      workMonths <= 0
        ? 'Сезон пропущен: веранда открылась бы только в октябре — деньги потрачены зря'
        : `Откроется с ${MONTHS_RU_GEN[openFromMonth - 1]} · ${workMonths} мес сезона`;
  } else {
    badge = (
      <Badge variant="secondary" className="bg-stone-100 text-stone-600">
        Нет разрешения
      </Badge>
    );
    statusText = month < VERANDA.permitFromMonth ? 'приём заявок с апреля' : `зал ${restaurant.seats} мест · разрешение продаётся до августа`;
  }

  // ===== Кнопка покупки =====
  const buyAllowed = !permit && month >= VERANDA.permitFromMonth && month <= VERANDA.seasonLastMonth - 1;
  const cashShort = !permit && cash < VERANDA.setupCost;
  const buyHint = permit
    ? null
    : month < VERANDA.permitFromMonth
      ? 'Приём заявок с апреля — раньше разрешения не продают'
      : month === VERANDA.seasonLastMonth - 1
        ? `Останется 1 мес сезона — последний шанс окупить установку`
        : month === VERANDA.seasonLastMonth
          ? 'Сезон пропущен: веранда открылась бы только в октябре'
          : month > VERANDA.seasonLastMonth
            ? 'Сезон закрыт — разрешение будет продаваться весной'
            : `Останется ${verandaSeasonMonths(month)} мес сезона`;

  // ===== Кнопка демонтажа =====
  const canDismantle = !!permit && !permit.removed && !permit.spoiled && month >= removalMonth;
  const dismantleCashShort = canDismantle && cash < VERANDA.removalCost;

  // ===== Таймлайн: подпись для скринридеров =====
  const timelineAria =
    `Таймлайн сезона веранды: разрешение продаётся с ${MONTHS_RU_GEN[VERANDA.permitFromMonth - 1]}, ` +
    `веранда работает с ${MONTHS_RU_GEN[Math.min(12, VERANDA.permitFromMonth + 1) - 1]} по ${MONTHS_RU[VERANDA.seasonLastMonth - 1]}, ` +
    `в ${MONTHS_RU_PREP[removalMonth - 1]} нужен демонтаж` +
    (permit
      ? `. Куплено в ${MONTHS_RU_PREP[boughtMonth - 1]}: рабочие месяцы — ${boughtMonth + 1 > VERANDA.seasonLastMonth ? 'нет (сезон пропущен)' : `${MONTHS_RU_GEN[Math.min(12, boughtMonth + 1) - 1]}—${MONTHS_RU[VERANDA.seasonLastMonth - 1]}`}`
      : '') +
    `. Сейчас ${MONTHS_RU[month - 1]}.`;

  return (
    <SectionCard
      title="Летняя веранда"
      icon={Sun}
      right={
        <span className="text-xs text-stone-500">
          Неделя {state.week} · {MONTHS_RU[month - 1]}
        </span>
      }
    >
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {badge}
            <span className="text-sm text-stone-600">{statusText}</span>
          </div>

          {/* Таймлайн сезона: Апр … Окт */}
          <div className="mb-4">
            <div
              className="flex gap-1.5"
              role="img"
              aria-label={timelineAria}
            >
              {VERANDA_TIMELINE_MONTHS.map((m) => {
                const isBought = !!permit && m === boughtMonth;
                const isWorking = !!permit && m > boughtMonth && m <= VERANDA.seasonLastMonth;
                const isRemoval = m === removalMonth;
                const isNow = m === month;
                const chipLabel = isBought ? 'разрешение' : isWorking ? 'работает' : isRemoval ? 'демонтаж' : '';
                return (
                  <div
                    key={m}
                    className={cn(
                      'flex-1 min-w-0 rounded-lg border py-1.5 px-1 text-center',
                      isBought
                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                        : isWorking
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : isRemoval
                            ? 'border-red-300 bg-red-100 text-red-800'
                            : 'border-stone-200 bg-stone-50 text-stone-400',
                      isNow && 'ring-2 ring-stone-800/50 ring-offset-1',
                    )}
                    title={
                      isNow
                        ? `${MONTHS_RU[m - 1]} — сейчас${chipLabel ? ` · ${chipLabel}` : ''}`
                        : chipLabel
                          ? `${MONTHS_RU[m - 1]} — ${chipLabel}`
                          : MONTHS_RU[m - 1]
                    }
                  >
                    <span className="block text-xs font-semibold leading-tight">{monthShort(m)}</span>
                    <span className="block text-[10px] leading-tight truncate">{chipLabel || '\u00A0'}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Рамкой выделен текущий месяц · жёлтый — покупка разрешения, зелёный — рабочие месяцы, красный — демонтаж
            </p>
          </div>

          <MetricRow
            label="Дополнительные места"
            value={permit ? `+${VERANDA.seats} к залу (${restaurant.seats})` : `— (зал ${restaurant.seats})`}
            hint="Веранда добавляет места только в активные месяцы сезона"
          />
          <MetricRow
            label="Сезон работы"
            value={`${MONTHS_RU[VERANDA.months[0] - 1]} — ${MONTHS_RU[VERANDA.seasonLastMonth - 1]}`}
            hint={`Разрешение продаётся с ${MONTHS_RU_GEN[VERANDA.permitFromMonth - 1]}; веранда открывается со следующего месяца после покупки`}
          />
          <MetricRow
            label="Содержание"
            value={`${money(VERANDA.monthlyExtraCost)}/мес`}
            hint="Списывается еженедельно (≈1/4.33 месяца) в активные месяцы"
          />
          <MetricRow
            label="Демонтаж / порча"
            value={`${money(VERANDA.removalCost)} / ${money(VERANDA.spoilageCost)}`}
            hint={`Не убрать в ${MONTHS_RU_PREP[removalMonth - 1]}: порча мебели −${Math.round(VERANDA.spoilageCost / 1000)} тыс ₽ + юр. риск +${VERANDA.lateLegalRisk}, далее +${VERANDA.lateLegalPerWeek}/нед`}
            tone={permit && !permit.removed && !permit.spoiled && month >= removalMonth ? 'bad' : 'neutral'}
          />
        </div>

        <div className="space-y-3 min-w-0">
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-sm',
              permit && !permit.removed && !permit.spoiled && month >= removalMonth
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-stone-200 bg-stone-50 text-stone-600',
            )}
            role={permit && !permit.removed && !permit.spoiled && month >= removalMonth ? 'alert' : undefined}
          >
            {permit && !permit.removed && !permit.spoiled && month >= removalMonth ? (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" aria-hidden />
            ) : (
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" aria-hidden />
            )}
            <p>
              {permit && !permit.removed && !permit.spoiled && month >= removalMonth
                ? 'Сезон закрыт, а веранда всё ещё на улице: дожди и ночные заморозки портят мебель и оборудование, юридический риск растёт каждую неделю. Демонтируйте веранду прямо сейчас — или она превратится в убыток.'
                : `+${VERANDA.seats} мест ≈ +15–20% посадок в тёплые месяцы; содержание ${Math.round(VERANDA.monthlyExtraCost / 1000)} тыс ₽/мес. Фиксированная цена при сокращающемся сезоне: купить в апреле — ${verandaSeasonMonths(VERANDA.permitFromMonth)} рабочих месяцев, в последний момент — не окупится.`}
            </p>
          </div>

          {/* Покупка разрешения */}
          {!permit && (
            <div className="space-y-1.5">
              <Button
                className="h-auto min-h-11 w-full whitespace-normal leading-snug bg-amber-600 hover:bg-amber-700 text-white"
                onClick={buyVeranda}
                disabled={disabled || !buyAllowed || cashShort}
              >
                <Sun className="h-4 w-4 mr-1.5" aria-hidden />
                Купить разрешение и установить — {money(VERANDA.setupCost)}
              </Button>
              <p className="text-xs text-stone-500">
                {buyAllowed
                  ? cashShort
                    ? `Не хватает ${money(VERANDA.setupCost - cash)} — разрешение можно купить позже (до августа)`
                    : buyHint
                  : buyHint}
              </p>
            </div>
          )}

          {/* Демонтаж */}
          {permit && !permit.removed && !permit.spoiled && (
            canDismantle ? (
              <div className="space-y-1.5">
                <Button
                  className="h-auto min-h-11 w-full whitespace-normal leading-snug bg-stone-800 hover:bg-stone-900 text-white"
                  onClick={dismantle}
                  disabled={disabled || dismantleCashShort}
                >
                  <Hammer className="h-4 w-4 mr-1.5" aria-hidden />
                  Демонтировать — {money(VERANDA.removalCost)}
                </Button>
                <p className="text-xs text-stone-500">
                  {dismantleCashShort
                    ? `Не хватает ${money(VERANDA.removalCost - cash)} — иначе веранду ждёт порча (−${Math.round(VERANDA.spoilageCost / 1000)} тыс ₽)`
                    : 'Бригада разбирает веранду и увозит мебель на склад до следующего сезона'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-stone-500">
                Демонтаж по погоде — с {MONTHS_RU_GEN[removalMonth - 1]} (сейчас {MONTHS_RU[month - 1]}).
                Не убранная вовремя веранда теряет мебель и растит юридический риск.
              </p>
            )
          )}
        </div>
      </div>
    </SectionCard>
  );
}

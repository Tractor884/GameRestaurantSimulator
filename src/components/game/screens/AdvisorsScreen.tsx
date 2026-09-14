/**
 * ============================================================================
 * ЭКРАН «СОВЕТНИКИ» (запрос пользователя, 27-a)
 * ============================================================================
 * Дом для персонажей, у которых раньше не было своего места в интерфейсе:
 * Ольга (маркетолог), Андрей (банкир), Игорь (владелец) — большие карточки
 * с живыми цифрами и советом (pure-брифы из presentation/advisors.ts);
 * ниже — компактная сетка команды по зонам (Анна/Максим/Ирина/Сергей/
 * Николай). Экран только читает состояние: без мутаций и ГСЧ.
 */
'use client';

import { useMemo, type ReactNode } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import {
  marketerBrief,
  bankerBrief,
  ownerBrief,
  peakKitchenLoad,
  currentFoodCost,
  getFinanceVisualState,
  getWarehouseVisualState,
  getEquipmentVisualState,
  type MarketerBrief,
  type BankerBrief,
  type OwnerBrief,
} from '@/lib/game/presentation';
import { serviceStatus, absoluteDay, type ServiceStatus } from '@/lib/game/engine';
import { SectionCard, moneyShort, pct } from '../widgets';
import { CharacterPanel } from '../visual/CharacterPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ContactRound,
  MessageSquareQuote,
  ArrowRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';

/* ────────────────────────── общие мини-компоненты ────────────────────────── */

type FigTone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_CLS: Record<FigTone, string> = {
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  neutral: 'text-stone-800',
};

/** Ячейка живой цифры (стиль мини-KPI CharacterPanel). */
function Fig({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: FigTone }) {
  return (
    <div className="min-w-0 rounded-lg bg-stone-50 px-2 py-1.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', TONE_CLS[tone])}>{value}</p>
    </div>
  );
}

/** Рамка-«поднос» карточки советника: портрет-панель + цифры + совет + кнопка. */
function AdvisorShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <article
      aria-label={label}
      className="flex flex-col gap-3 rounded-2xl bg-stone-100/70 p-3 transition-shadow hover:shadow-md sm:p-4"
    >
      {children}
    </article>
  );
}

/** Совет советника: акцентный блок над кнопкой перехода. */
function AdviceBox({ text }: { text: string }) {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p className="text-xs leading-relaxed text-amber-900">{text}</p>
    </div>
  );
}

/* ───────────────────────── Ольга — маркетолог (большая) ───────────────────────── */

function MarketerCard({ brief, onGo }: { brief: MarketerBrief; onGo: () => void }) {
  return (
    <AdvisorShell label="Ольга — маркетолог">
      <CharacterPanel characterId="marketer" vertical />
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Живые цифры
        </p>
        {brief.activeCampaigns.length > 0 ? (
          <ul className="space-y-1.5">
            {brief.activeCampaigns.map((c) => (
              <li key={c.channelId} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-stone-600">{c.channelName}</span>
                <span className="shrink-0 font-semibold tabular-nums text-stone-800">
                  {c.remainingWeeks} нед · {moneyShort(c.weeklyBudget)}/нед
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-stone-500">
            Активных кампаний нет — трафик живёт на базовом спросе и репутации.
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Fig
            label="Тренд гостей"
            value={`${brief.trend > 0 ? '+' : ''}${(brief.trend * 100).toFixed(1)}%`}
            tone={brief.trend < -0.05 ? 'bad' : brief.trend > 0.08 ? 'good' : 'neutral'}
          />
          <Fig
            label="Доля маркетинга"
            value={brief.budgetShare !== null ? pct(brief.budgetShare) : '—'}
            tone={
              brief.budgetShare === null
                ? 'neutral'
                : brief.budgetShare > 0.06
                  ? 'bad'
                  : brief.budgetShare >= 0.02
                    ? 'good'
                    : 'warn'
            }
          />
          <Fig label="Ядро-сегмент" value={brief.coreSegmentName || '—'} />
          <Fig
            label="Лучший канал"
            value={brief.bestChannelName || '—'}
          />
        </div>
      </div>
      <div className="mt-auto space-y-3">
        <AdviceBox text={brief.advice} />
        <Button
          className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onGo}
          aria-label="Открыть экран «Маркетинг»: каналы, кампании и клининг"
        >
          К кампаниям
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </AdvisorShell>
  );
}

/* ───────────────────────── Андрей — банкир (большая) ───────────────────────── */

function BankerCard({ brief, onGo }: { brief: BankerBrief; onGo: () => void }) {
  // Дегенеративный кейс недели 1 (нет закрытых недель): runway ещё не
  // считаем — avgWeeklyOut падает в защитную 1 ₽ и даёт абсурдные цифры.
  const hasWeeks = brief.hasWeeks;
  return (
    <AdvisorShell label="Андрей — банкир">
      <CharacterPanel characterId="banker" vertical />
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Живые цифры
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <Fig
            label="Долг остаток"
            value={brief.debtRemaining > 0 ? moneyShort(brief.debtRemaining) : 'нет'}
            tone={brief.debtRemaining > 0 ? 'neutral' : 'good'}
          />
          <Fig
            label="Платёж / 4 нед"
            value={brief.payments4w > 0 ? moneyShort(brief.payments4w) : '—'}
          />
          <Fig
            label="Прибыль / 4 нед"
            value={brief.profit4w !== null ? moneyShort(brief.profit4w) : '—'}
            tone={
              brief.profit4w === null
                ? 'neutral'
                : brief.profit4w < 0
                  ? 'bad'
                  : 'good'
            }
          />
          <Fig
            label="DSCR (4 нед)"
            value={brief.dscr !== null ? brief.dscr.toFixed(2) : '—'}
            tone={
              brief.dscr === null
                ? 'neutral'
                : brief.dscr >= 1.2
                  ? 'good'
                  : brief.dscr >= 1.1
                    ? 'warn'
                    : 'bad'
            }
          />
          <Fig
            label="Плечо (долг/активы)"
            value={brief.leverage.toFixed(2)}
            tone={brief.leverage > 1 ? 'bad' : brief.leverage > 0.5 ? 'warn' : 'good'}
          />
          <Fig
            label="Runway кассы"
            value={hasWeeks ? `${brief.runwayWeeks.toFixed(1)} нед` : '—'}
            tone={!hasWeeks ? 'neutral' : brief.runwayWeeks < 1 ? 'bad' : brief.runwayWeeks < 4 ? 'warn' : 'good'}
          />
        </div>
      </div>
      <div className="mt-auto space-y-3">
        <AdviceBox text={brief.advice} />
        <Button
          className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onGo}
          aria-label="Открыть экран «Кредиты»: долги, платежи и погашение"
        >
          К кредитам
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </AdvisorShell>
  );
}

/* ───────────────────────── Игорь — владелец (большая) ───────────────────────── */

function OwnerCard({ brief, onGo }: { brief: OwnerBrief; onGo: () => void }) {
  return (
    <AdvisorShell label="Игорь — владелец">
      <CharacterPanel characterId="owner" vertical />
      <div className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Цели года — {brief.onTrackCount} из 5 в графике
        </p>
        <ul className="space-y-2">
          {brief.goals.map((g) => {
            const p = Math.max(0, Math.min(100, g.progress * 100));
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {g.onTrack ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="в графике" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-hidden />
                    )}
                    <span className="truncate text-stone-600">{g.title}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className={cn('font-semibold', g.onTrack ? 'text-emerald-700' : 'text-stone-800')}>
                      {g.value}
                    </span>
                    <span className="text-stone-400"> / {g.target}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      g.onTrack ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-stone-400',
                    )}
                    style={{ width: `${p}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(p)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${g.title}: ${g.value} из ${g.target}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-3 gap-1.5">
          <Fig
            label="BSC недели"
            value={`${brief.bscLastWeek}`}
            tone={brief.bscLastWeek >= 70 ? 'good' : brief.bscLastWeek >= 55 ? 'warn' : 'bad'}
          />
          <Fig label="Дивиденды" value={moneyShort(brief.dividendsPaid)} />
          <Fig label="До финала" value={`${brief.weeksLeft} нед`} />
        </div>
      </div>
      <div className="mt-auto space-y-3">
        <AdviceBox text={brief.advice} />
        <Button
          className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onGo}
          aria-label="Открыть экран «Квартальный разбор»: цели года и BSC"
        >
          К квартальному разбору
          <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </AdvisorShell>
  );
}

/* ───────────────────────── команда по зонам (компактные) ───────────────────────── */

interface TeamCardData {
  characterId: 'hr' | 'chef' | 'accountant' | 'warehouse_manager' | 'technician';
  label: string;
  figures: { label: string; value: string; tone?: FigTone }[];
  button: string;
  screen: 'staff' | 'menu' | 'finance' | 'warehouse' | 'equipment';
  aria: string;
}

const SERVICE_LABELS: Record<ServiceStatus, { label: string; tone: FigTone }> = {
  fresh: { label: 'в норме', tone: 'good' },
  protected: { label: 'идёт защита', tone: 'good' },
  neglected: { label: 'запущено', tone: 'bad' },
};

function TeamCard({ data, onGo }: { data: TeamCardData; onGo: (screen: TeamCardData['screen']) => void }) {
  return (
    <article
      aria-label={data.label}
      className="flex flex-col gap-2.5 rounded-2xl bg-stone-100/70 p-3 transition-shadow hover:shadow-md"
    >
      <CharacterPanel compact characterId={data.characterId} />
      <div className="grid grid-cols-3 gap-1.5">
        {data.figures.map((f) => (
          <Fig key={f.label} label={f.label} value={f.value} tone={f.tone} />
        ))}
      </div>
      <Button
        variant="outline"
        className="mt-auto h-11 border-stone-300"
        onClick={() => onGo(data.screen)}
        aria-label={data.aria}
      >
        {data.button}
        <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
      </Button>
    </article>
  );
}

/* ───────────────────────────────── экран ───────────────────────────────── */

export function AdvisorsScreen() {
  const state = useGame((s) => s.state)!;
  const setScreen = useGame((s) => s.setScreen);

  const marketer = useMemo(() => marketerBrief(state), [state]);
  const banker = useMemo(() => bankerBrief(state), [state]);
  const owner = useMemo(() => ownerBrief(state), [state]);

  const team = useMemo<TeamCardData[]>(() => {
    const r = state.restaurant;
    if (!r) return [];

    // Анна: штат / усталость / мораль.
    let cnt = 0;
    let fatigue = 0;
    let morale = 0;
    for (const p of Object.values(r.staff.pools)) {
      fatigue += p.fatigue * p.count;
      morale += p.morale * p.count;
      cnt += p.count;
    }
    const avgFatigue = cnt > 0 ? fatigue / cnt : 0;
    const avgMorale = cnt > 0 ? morale / cnt : 0;

    // Максим: пик кухни / FC / стоп-листы.
    const peak = peakKitchenLoad(state);
    const fc = currentFoodCost(state);
    const stopHits = state.lastDayResult?.kpi.stopListHits ?? 0;

    // Ирина: касса / runway / прибыль недели (готовый finance-хелпер).
    const fin = getFinanceVisualState(state);

    // Сергей: покрытие склада / порча / сбои поставок (готовый warehouse-хелпер).
    const wh = getWarehouseVisualState(state);
    const supplyErrors = r.inventory.supplyErrorsWeek ?? 0;
    // День 1 без логов: оценка потребности ещё не работает — покрытие не считаем.
    const hasDayLogs = state.history.dayLogs.length > 0;
    // Неделя 1 без закрытых недель: runway Ирины — прочерк (защитный avgWeeklyOut).
    const hasWeeks = state.history.weekStats.length > 0;

    // Николай: износ зон / техриск / ТО (готовый equipment-хелпер + статус ТО).
    const eq = getEquipmentVisualState(state);
    const maxWear = eq.zones.length > 0 ? Math.max(...eq.zones.map((z) => z.wear)) : 0;
    const absDay = absoluteDay(state);
    let service: ServiceStatus = 'fresh';
    for (const z of [r.equipment.kitchen, r.equipment.coffee, r.equipment.hall]) {
      const st = serviceStatus(z.lastServicedAt, absDay);
      if (st === 'neglected') {
        service = 'neglected';
        break;
      }
      if (st === 'protected') service = 'protected';
    }

    return [
      {
        characterId: 'hr',
        label: 'Анна — HR-директор',
        figures: [
          { label: 'Штат', value: `${cnt} чел` },
          { label: 'Усталость', value: `${avgFatigue.toFixed(0)}/100`, tone: avgFatigue > 60 ? 'bad' : avgFatigue > 30 ? 'warn' : 'good' },
          { label: 'Мораль', value: `${avgMorale.toFixed(0)}/100`, tone: avgMorale < 50 ? 'bad' : avgMorale < 75 ? 'warn' : 'good' },
        ],
        button: 'К персоналу',
        screen: 'staff',
        aria: 'Открыть экран «Персонал»: пулы, найм и благосостояние',
      },
      {
        characterId: 'chef',
        label: 'Максим — шеф-повар',
        figures: [
          { label: 'Пик кухни', value: peak.toFixed(2), tone: peak >= 1.2 ? 'bad' : peak >= 1 ? 'warn' : 'good' },
          { label: 'Food Cost', value: pct(fc), tone: fc > 0.36 ? 'bad' : fc < 0.34 ? 'good' : 'warn' },
          { label: 'Стоп-листы', value: `${stopHits}`, tone: stopHits > 0 ? 'warn' : 'good' },
        ],
        button: 'К меню',
        screen: 'menu',
        aria: 'Открыть экран «Меню»: блюда, цены и стоп-листы',
      },
      {
        characterId: 'accountant',
        label: 'Ирина — главный бухгалтер',
        figures: [
          { label: 'Касса', value: moneyShort(r.finance.cash) },
          { label: 'Runway', value: hasWeeks ? `${fin.runwayWeeks.toFixed(1)} нед` : '—', tone: !hasWeeks ? 'neutral' : fin.runwayWeeks < 1 ? 'bad' : fin.runwayWeeks < 4 ? 'warn' : 'good' },
          { label: 'Прибыль/нед', value: moneyShort(fin.lastNetProfit), tone: fin.lastNetProfit < 0 ? 'bad' : 'good' },
        ],
        button: 'К финансам',
        screen: 'finance',
        aria: 'Открыть экран «Финансы»: P&L, кэшфлоу и транзакции',
      },
      {
        characterId: 'warehouse_manager',
        label: 'Сергей — кладовщик',
        figures: [
          { label: 'Покрытие', value: hasDayLogs ? `${wh.coverDays.toFixed(1)} дн` : '—', tone: !hasDayLogs ? 'neutral' : wh.coverDays < 0.5 ? 'bad' : wh.coverDays < 1.5 ? 'warn' : 'good' },
          { label: 'Порча', value: pct(wh.wasteShare), tone: wh.wasteShare > 0.05 ? 'bad' : 'neutral' },
          { label: 'Сбои', value: `${supplyErrors}`, tone: supplyErrors > 0 ? 'warn' : 'good' },
        ],
        button: 'К складу',
        screen: 'warehouse',
        aria: 'Открыть экран «Склад»: партии, закупки и сроки',
      },
      {
        characterId: 'technician',
        label: 'Николай — техник',
        figures: [
          { label: 'Макс. износ', value: `${maxWear.toFixed(0)}/100`, tone: maxWear >= 80 ? 'bad' : maxWear >= 60 ? 'warn' : 'good' },
          { label: 'Техриск', value: `${r.risks.technical.toFixed(0)}`, tone: r.risks.technical >= 70 ? 'bad' : r.risks.technical >= 50 ? 'warn' : 'good' },
          { label: 'ТО', value: SERVICE_LABELS[service].label, tone: SERVICE_LABELS[service].tone },
        ],
        button: 'К оборудованию',
        screen: 'equipment',
        aria: 'Открыть экран «Оборудование»: износ, ремонт и профилактика',
      },
    ];
  }, [state]);

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <SectionCard title="Советники" icon={ContactRound}>
        <p className="text-sm text-stone-600">
          Ваш совет директоров и ключевые контакты: каждый видит свою зону и подскажет решение.
          Ольга следит за спросом и кампаниями, Андрей — за долгом и платежами, Игорь — за целями
          года; ниже — команда по зонам ресторана.
        </p>
      </SectionCard>

      {/* Совет директоров — три больших советника */}
      <section aria-labelledby="advisors-board-heading" className="space-y-3">
        <h2
          id="advisors-board-heading"
          className="px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400"
        >
          Совет директоров
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <MarketerCard brief={marketer} onGo={() => setScreen('marketing')} />
          <BankerCard brief={banker} onGo={() => setScreen('loans')} />
          <OwnerCard brief={owner} onGo={() => setScreen('quarterly')} />
        </div>
      </section>

      {/* Команда по зонам — компактные карточки */}
      <section aria-labelledby="advisors-team-heading" className="space-y-3">
        <h2
          id="advisors-team-heading"
          className="px-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400"
        >
          Команда по зонам
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((t) => (
            <TeamCard key={t.characterId} data={t} onGo={(screen) => setScreen(screen)} />
          ))}
        </div>
      </section>
    </div>
  );
}

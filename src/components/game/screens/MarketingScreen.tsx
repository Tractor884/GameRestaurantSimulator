/**
 * Экран «Маркетинг» (ТЗ §23): каналы привлечения, бюджет клининга,
 * генеральная уборка.
 */
'use client';

import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, KpiCard, money, moneyShort, pct } from '../widgets';
import { MARKETING_CHANNELS, MARKETING_CHANNELS_MAP, CLEANING } from '@/lib/game/config/marketing.config';
import { SEGMENTS } from '@/lib/game/config/segments.config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Megaphone, Play, Square, Sparkles, Droplets, Wallet, Brush } from 'lucide-react';
import type { MarketingCampaign, SegmentId } from '@/lib/game/types';

const DURATION_OPTIONS = [4, 8, 12, 26];

export function MarketingScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const campaign = useGame((s) => s.campaign);
  const stopCampaign = useGame((s) => s.stopCampaign);
  const cleaning = useGame((s) => s.cleaning);
  const deepClean = useGame((s) => s.deepClean);
  const disabled = state.phase === 'gameover';

  const campaigns = restaurant.marketing.campaigns;
  const campaignByChannel = useMemo(
    () => new Map<string, MarketingCampaign>(campaigns.map((c) => [c.channelId, c])),
    [campaigns],
  );

  const weeklySpend = campaigns.reduce((s, c) => s + c.weeklyBudget, 0);
  const lastWeek = state.history.weekStats[state.history.weekStats.length - 1];
  const marketingShare = lastWeek && lastWeek.revenue > 0 ? (weeklySpend + restaurant.marketing.cleaningBudget) / lastWeek.revenue : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Megaphone}
          label="Активных кампаний"
          value={String(campaigns.length)}
          sub={`расход ${moneyShort(weeklySpend)}/нед`}
          tone={campaigns.length > 0 ? 'good' : 'default'}
        />
        <KpiCard
          icon={Wallet}
          label="Маркетинг+клининг"
          value={marketingShare !== null ? pct(marketingShare) : '—'}
          sub="цель 2–5% выручки"
          tone={
            marketingShare === null
              ? 'default'
              : marketingShare > 0.06
                ? 'bad'
                : marketingShare >= 0.02
                  ? 'good'
                  : 'warn'
          }
        />
        <KpiCard
          icon={Droplets}
          label="Чистота"
          value={`${restaurant.cleanliness.toFixed(0)}/100`}
          sub={`клининг ${moneyShort(restaurant.marketing.cleaningBudget)}/нед`}
          tone={restaurant.cleanliness >= 70 ? 'good' : restaurant.cleanliness >= 50 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={Brush}
          label="Бюджет клининга"
          value={moneyShort(restaurant.marketing.cleaningBudget)}
          sub={`поддержание: ${moneyShort(CLEANING.baseWeeklyBudget)}`}
        />
      </div>

      {/* Каналы */}
      <SectionCard title="Каналы привлечения" icon={Megaphone}>
        <div className="grid md:grid-cols-2 gap-4">
          {MARKETING_CHANNELS.map((ch) => {
            const active = campaignByChannel.get(ch.id);
            return (
              <ChannelCard
                /* key пересоздаёт карточку при старте/остановке кампании — бюджет сбрасывается к актуальному */
                key={active ? `${ch.id}-${active.weeklyBudget}` : ch.id}
                channelId={ch.id}
                campaign={active ?? null}
                week={state.week}
                disabled={disabled}
                onStart={(budget, duration) => campaign(ch.id, budget, duration)}
                onStop={() => stopCampaign(ch.id)}
              />
            );
          })}
        </div>
      </SectionCard>

      {/* Клининг */}
      <SectionCard title="Чистота и уборка" icon={Droplets}>
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-stone-800">
                Бюджет клининга: {money(restaurant.marketing.cleaningBudget)}/нед
              </span>
              <span className="text-xs text-stone-500">
                эффект ≈ +{(
                  restaurant.marketing.cleaningBudget * CLEANING.cleanlinessEffectPerBudget
                ).toFixed(1)}{' '}
                к чистоте
              </span>
            </div>
            <CleaningSlider
              key={restaurant.marketing.cleaningBudget}
              value={restaurant.marketing.cleaningBudget}
              disabled={disabled}
              onCommit={(v) => cleaning(v)}
            />
            <p className="text-xs text-stone-400 mt-1.5">
              {moneyShort(CLEANING.baseWeeklyBudget)}/нед — поддержание чистоты; больше — рост
              качества. Экономия на уборке повышает санитарный риск и портит отзывы.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-medium text-stone-800">Генеральная уборка</p>
              <p className="text-xs text-stone-500 mt-0.5">
                Разовая санобработка: +{CLEANING.deepCleaningEffect} чистоты и заметное снижение
                санитарного риска перед проверками.
              </p>
            </div>
            <Button
              className="h-11 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={deepClean}
              disabled={disabled}
              title={`Стоимость: ${money(CLEANING.deepCleaningCost)}`}
            >
              <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
              Генеральная уборка {moneyShort(CLEANING.deepCleaningCost)}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/** Карточка канала маркетинга. */
function ChannelCard({
  channelId,
  campaign,
  week,
  disabled,
  onStart,
  onStop,
}: {
  channelId: string;
  campaign: MarketingCampaign | null;
  week: number;
  disabled: boolean;
  onStart: (weeklyBudget: number, durationWeeks: number) => void;
  onStop: () => void;
}) {
  const ch = MARKETING_CHANNELS_MAP[channelId];
  const [budget, setBudget] = useState(campaign?.weeklyBudget ?? ch.defaultWeeklyBudget);
  const [duration, setDuration] = useState(8);
  const active = !!campaign;

  // Подсказка лифта: maxLift × (1 − exp(−дневной бюджет / scale)).
  const dailySpend = budget / 7;
  const lift = ch.maxLift * (1 - Math.exp(-dailySpend / ch.scale));
  const best = Object.entries(ch.affinity).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  const bestSegName = SEGMENTS[best[0] as SegmentId]?.name ?? '';
  const bestSegAffinity = best[1] ?? 0;
  const weightedLift = lift * bestSegAffinity;

  const remaining = campaign ? Math.max(0, campaign.startWeek + campaign.durationWeeks - week) : 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        active ? 'border-amber-300 bg-amber-50/50' : 'border-stone-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-800">{ch.name}</p>
          <p className="text-xs text-stone-500 mt-0.5">{ch.description}</p>
        </div>
        {active ? (
          <Badge className="bg-amber-600 text-white shrink-0">Активна</Badge>
        ) : (
          <Badge variant="secondary" className="bg-stone-100 text-stone-600 shrink-0">
            до +{(ch.maxLift * 100).toFixed(0)}%
          </Badge>
        )}
      </div>

      <div className="text-xs text-stone-600 bg-stone-50 rounded-lg px-2.5 py-2">
        При бюджете <b className="tabular-nums text-stone-800">{moneyShort(budget)}</b>/нед: спрос{' '}
        <b className="text-emerald-700">+{pct(weightedLift, 1)}</b> для сегмента «{bestSegName}»
        <span className="text-stone-400"> (отклик ×{bestSegAffinity.toFixed(1)})</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-stone-500">Бюджет, ₽/нед</span>
          <span className="font-semibold tabular-nums text-stone-800">{money(budget)}</span>
        </div>
        <Slider
          value={[budget]}
          min={ch.minWeeklyBudget}
          max={ch.maxWeeklyBudget}
          step={5_000}
          disabled={active || disabled}
          onValueChange={(v) => setBudget(v[0])}
          onValueCommit={(v) => setBudget(v[0])}
          aria-label={`Бюджет канала ${ch.name}`}
          className="py-1.5"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!active && (
          <Select
            value={String(duration)}
            onValueChange={(v) => setDuration(Number.parseInt(v, 10))}
            disabled={disabled}
          >
            <SelectTrigger className="w-36 h-11" aria-label="Длительность кампании">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} недель
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {active ? (
          <>
            <div className="text-xs text-stone-600 flex-1 min-w-[140px]">
              осталось <b className="text-stone-800">{remaining} нед</b> ·{' '}
              {moneyShort(campaign!.weeklyBudget)}/нед
            </div>
            <Button
              variant="outline"
              className="h-11 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={onStop}
              disabled={disabled}
            >
              <Square className="h-4 w-4 mr-1.5" aria-hidden />
              Остановить
            </Button>
          </>
        ) : (
          <Button
            className="h-11 ml-auto bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => onStart(budget, duration)}
            disabled={disabled}
          >
            <Play className="h-4 w-4 mr-1.5" aria-hidden />
            Запустить
          </Button>
        )}
      </div>
    </div>
  );
}

/** Слайдер клининга с локальным значением. */
function CleaningSlider({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <Slider
      value={[local]}
      min={0}
      max={150_000}
      step={5_000}
      disabled={disabled}
      onValueChange={(v) => setLocal(v[0])}
      onValueCommit={(v) => onCommit(v[0])}
      aria-label="Бюджет клининга, ₽ в неделю"
      className="py-1.5"
    />
  );
}

/**
 * ДИАЛОГ ЭКСТРЕННЫХ РЕШЕНИЙ (ТЗ §8.4–8.6, дорожная карта §12.5).
 *
 * Показывается, когда после обеденного пика движок нашёл проблемы: день
 * наполовину прожит, игрок тушит пожары до вечернего пика.
 * Карточки решений по ТЗ §8.6: название, стоимость, время, описание,
 * ориентировочные последствия, диапазон риска.
 *
 * Дизайн: «красный час» ресторана — тёплая тревожная гамма (amber/red),
 * крупные цифры снимка дня, карточки действий с последствиями.
 */
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { STATIONS } from '@/lib/game/config/staffRoles.config';
import { useGame } from '@/lib/game/store/gameStore';
import { money } from './widgets';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  Users,
  UserX,
  Wallet,
  Star,
  ChefHat,
  Coffee,
  UserPlus,
  Percent,
  Truck,
  Sparkles,
  Wrench,
  Check,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';

const ICONS: Record<string, typeof Coffee> = {
  UserPlus,
  Coffee,
  Percent,
  Truck,
  ChefHat,
  Sparkles,
  Wrench,
};

const STATION_NAME = (st: string) => STATIONS[st as keyof typeof STATIONS]?.name ?? st;

export function EmergencyDialog() {
  const midday = useGame((s) => s.midday);
  const busy = useGame((s) => s.busy);
  const applyEmergency = useGame((s) => s.applyEmergency);
  const continueMidday = useGame((s) => s.continueMidday);

  const snap = midday?.snapshot;
  const applied = midday?.applied ?? [];
  const cashNow = midday?.draft.restaurant?.finance.cash ?? snap?.cash ?? 0;

  return (
    <Dialog open={!!snap} onOpenChange={() => undefined}>
      <DialogContent className="max-w-2xl sm:max-w-2xl p-0 overflow-hidden gap-0" aria-describedby="emergency-desc">
        {snap && (
          <>
            {/* Шапка: «красный час» */}
            <div className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 px-5 py-4 text-white">
              <DialogHeader className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
                  <Clock className="h-5 w-5" aria-hidden />
                  {String(snap.hour).padStart(2, '0')}:00 — обеденный пик позади
                </DialogTitle>
                <DialogDescription className="text-orange-50 text-xs sm:text-sm">
                  День поставлен на паузу: найдены проблемы, вечерний пик впереди.
                  Экстренные решения действуют до конца дня (ТЗ §8.4).
                  <span id="emergency-desc" className="sr-only">Выберите экстренные меры и продолжите день</span>
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Снимок дня: живые цифры к 15:00 */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <MiniStat icon={<Users className="h-3.5 w-3.5" aria-hidden />} label="гостей" value={String(snap.guests)} />
                <MiniStat
                  icon={<UserX className="h-3.5 w-3.5" aria-hidden />}
                  label="ушло"
                  value={String(snap.lostGuests)}
                  tone={snap.lostGuests > 6 ? 'bad' : 'ok'}
                />
                <MiniStat
                  icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                  label="в очереди"
                  value={String(snap.queueNow)}
                  tone={snap.queueNow >= 8 ? 'warn' : 'ok'}
                />
                <MiniStat icon={<Wallet className="h-3.5 w-3.5" aria-hidden />} label="выручка" value={money(snap.revenueSoFar)} />
                <MiniStat
                  icon={<Star className="h-3.5 w-3.5" aria-hidden />}
                  label="удовл."
                  value={`${snap.satisfactionSoFar}`}
                  tone={snap.satisfactionSoFar < 62 ? 'bad' : 'ok'}
                />
                <MiniStat
                  icon={<ChefHat className="h-3.5 w-3.5" aria-hidden />}
                  label="пик кухни"
                  value={snap.stationPeak[0] ? `${Math.round(snap.stationPeak[0].load * 100)}%` : '—'}
                  tone={(snap.stationPeak[0]?.load ?? 0) > 1.15 ? 'bad' : 'ok'}
                />
              </div>

              {/* Проблемы */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Что случилось</p>
                <AnimatePresence initial={false}>
                  {snap.problems.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border p-2.5',
                        p.severity === 'high'
                          ? 'border-red-200 bg-red-50'
                          : 'border-amber-200 bg-amber-50',
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          'h-4 w-4 mt-0.5 shrink-0',
                          p.severity === 'high' ? 'text-red-600' : 'text-amber-600',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-800">{p.title}</span>
                          <Badge
                            className={cn(
                              'text-[10px] uppercase px-1.5',
                              p.severity === 'high'
                                ? 'bg-red-100 text-red-800 hover:bg-red-100'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                            )}
                          >
                            {p.severity === 'high' ? 'критично' : 'важно'}
                          </Badge>
                        </div>
                        <p className="text-xs text-stone-600 mt-0.5">{p.detail}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Карточки решений */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Экстренные решения — можно применить несколько
                </p>
                <ScrollArea className="max-h-[46vh] pr-3">
                  <div className="space-y-2.5 pt-0.5">
                    {snap.options.map((o) => {
                      const isApplied = applied.includes(o.id);
                      const tooPoor = o.cost > cashNow;
                      const Icon = ICONS[o.icon] ?? Coffee;
                      return (
                        <motion.div
                          key={o.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            'rounded-xl border p-3 sm:p-3.5 transition-colors',
                            isApplied
                              ? 'border-emerald-300 bg-emerald-50/70'
                              : tooPoor
                                ? 'border-stone-200 bg-stone-50 opacity-70'
                                : 'border-stone-200 bg-white hover:border-amber-400 hover:shadow-sm',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div
                                className={cn(
                                  'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                                  isApplied ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                                )}
                              >
                                <Icon className="h-4.5 w-4.5" aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-stone-800 leading-tight">{o.title}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      'tabular-nums text-[11px] px-1.5',
                                      o.cost === 0
                                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                                        : 'bg-stone-100 text-stone-700',
                                    )}
                                  >
                                    {o.cost === 0 ? 'бесплатно' : money(o.cost)}
                                  </Badge>
                                  <Badge variant="secondary" className="bg-stone-100 text-stone-500 text-[11px] px-1.5 font-normal">
                                    <Clock className="h-3 w-3 mr-1" aria-hidden />
                                    {o.time}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            {isApplied ? (
                              <div className="flex items-center gap-1 text-emerald-700 text-xs font-semibold shrink-0">
                                <Check className="h-4 w-4" aria-hidden />
                                применено
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant={tooPoor ? 'ghost' : 'default'}
                                disabled={tooPoor}
                                onClick={() => applyEmergency(o.id)}
                                className={cn(
                                  'shrink-0 h-8',
                                  !tooPoor && 'bg-amber-600 hover:bg-amber-700 text-white',
                                  tooPoor && 'text-stone-400',
                                )}
                                title={tooPoor ? 'Недостаточно денег на счёте' : 'Применить до конца дня'}
                              >
                                {tooPoor ? 'нет денег' : 'Применить'}
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 mt-2">{o.description}</p>
                          <div className="mt-2 grid sm:grid-cols-[1fr_auto] gap-x-3 items-start">
                            <ul className="space-y-0.5">
                              {o.consequences.map((c, i) => (
                                <li key={i} className="text-[11px] text-stone-500 flex items-start gap-1.5">
                                  <span className="text-amber-500 mt-px shrink-0" aria-hidden>
                                    •
                                  </span>
                                  <span>{c}</span>
                                </li>
                              ))}
                            </ul>
                            <span className="text-[10px] text-stone-400 sm:text-right sm:max-w-[180px]">{o.riskNote}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Низ: продолжить день */}
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-stone-100">
                <p className="text-[11px] text-stone-400 hidden sm:block">
                  Касса сейчас: <span className="tabular-nums font-semibold text-stone-600">{money(cashNow)}</span>
                  {applied.length > 0 && ` · применено мер: ${applied.length}`}
                </p>
                <Button
                  onClick={continueMidday}
                  disabled={busy}
                  className="ml-auto bg-red-600 hover:bg-red-700 text-white font-semibold px-5"
                >
                  Продолжить день до закрытия
                  <ArrowRight className="h-4 w-4 ml-1" aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone = 'ok',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-1.5',
        tone === 'bad' ? 'border-red-200 bg-red-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white',
      )}
    >
      <div className="flex items-center gap-1 text-stone-400">
        {icon}
        <span className="text-[10px] uppercase tracking-wide truncate">{label}</span>
      </div>
      <p
        className={cn(
          'text-sm font-bold tabular-nums leading-tight',
          tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-stone-800',
        )}
      >
        {value}
      </p>
    </div>
  );
}

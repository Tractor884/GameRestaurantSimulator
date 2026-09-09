/**
 * SVG-СЦЕНА ЗАЛА РЕСТОРАНА (ТЗ §31.1) — визуализация «живого» дня.
 *
 * ЧТО ПОКАЗЫВАЕТ:
 *  - план зала: столы (2- и 4-местные), веранда (май–сентябрь), кухня с 6 станциями;
 *  - очередь у входа (человечки = средняя очередь этого часа);
 *  - занятость столов в выбранный час (заполнение «по привлекательности»: центр → окна → веранда);
 *  - загрузку станций кухни цветом (зелёный <80%, янтарный <100%, красный — перегруз);
 *  - покадровое воспроизведение дня: слайдер по часам + play.
 *
 * ДАННЫЕ: state.lastDayResult.hourLogs (почасовые логи последнего дня).
 * Заполнение столов — ВИЗУАЛИЗАЦИЯ (движок не хранит отдельные столы):
 * доля занятых = seated/totalSeats этого часа.
 *
 * Дизайн: тёплая палитра (stone/amber/emerald/red), CSS-transition заливок,
 * preserveAspectRatio для адаптива, тултипы через <title>.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useGame } from '@/lib/game/store/gameStore';
import { STATIONS } from '@/lib/game/config/staffRoles.config';
import { EmptyState, money } from './widgets';
import { InfoHint } from './hints';
import type { HourLog, StationType } from '@/lib/game/types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  MapPin,
  Users,
  DoorOpen,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ============================= ГЕОМЕТРИЯ ЗАЛА ============================= */

interface TableSeat {
  id: string;
  x: number;
  y: number;
  seats: number; // 2 или 4
  zone: 'center' | 'window' | 'veranda';
  /** Порядок привлекательности (меньше = занят раньше). */
  desirability: number;
}

const W = 900;
const H = 470;

/** Кухонная полоса: 6 станций в ряд. */
const KITCHEN = { x: 20, y: 16, w: 620, h: 96 };
const STATION_ORDER: StationType[] = ['hot_kitchen', 'cold_kitchen', 'prep', 'coffee', 'dessert', 'bar_service'];

/** Веранда — правая колонна (активна только май–сентябрь). */
const VERANDA = { x: 660, y: 16, w: 220, h: 320 };

/** Вход — низ по центру. */
const ENTRANCE = { x: 330, y: H - 84, w: 140, h: 40 };

/** Строим сетку столов под конфигурацию ресторана. */
function buildTables(seats: number, verandaSeats: number): TableSeat[] {
  const tables: TableSeat[] = [];
  // Основной зал: ~70% мест за 4-местными, ~30% за 2-местными у «окон» (левая стена).
  const hallSeats = seats;
  const fourCount = Math.max(1, Math.round((hallSeats * 0.72) / 4));
  const twoCount = Math.max(2, Math.round((hallSeats * 0.28) / 2));

  // 4-местные: сетка 3 колонки × N рядов в центре зала.
  const cols = 3;
  const rows = Math.ceil(fourCount / cols);
  const gridX0 = 130;
  const gridY0 = 150;
  const stepX = 165;
  const stepY = Math.max(78, (330 - 150) / Math.max(1, rows));
  for (let i = 0; i < fourCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    tables.push({
      id: `t4-${i}`,
      x: gridX0 + col * stepX,
      y: gridY0 + row * stepY + 20,
      seats: 4,
      zone: 'center',
      // Привлекательность: центр зала раньше (меньше row+col), потом края.
      desirability: row * 3 + col,
    });
  }

  // 2-местные: колонка вдоль левой стены («окна»).
  const winRows = Math.min(6, twoCount);
  for (let i = 0; i < winRows; i++) {
    tables.push({
      id: `t2-${i}`,
      x: 66,
      y: 150 + i * (188 / Math.max(1, winRows - 1 || 1)),
      seats: 2,
      zone: 'window',
      desirability: 20 + i, // окна — второй приоритет
    });
  }

  // Веранда (если есть): 2-местные в правой зоне, привлекательность ниже (сезон/улица).
  if (verandaSeats > 0) {
    const vCount = Math.max(2, Math.round(verandaSeats / 2));
    const vFit = Math.min(vCount, 6);
    for (let i = 0; i < vFit; i++) {
      tables.push({
        id: `tv-${i}`,
        x: VERANDA.x + 46 + (i % 2) * 110,
        y: VERANDA.y + 64 + Math.floor(i / 2) * 82,
        seats: 2,
        zone: 'veranda',
        desirability: 40 + i, // веранду занимают в последнюю очередь
      });
    }
  }
  return tables;
}

/* ============================= КОМПОНЕНТ ============================= */

export function HallScene() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const hourLogs = state.lastDayResult?.hourLogs ?? [];

  /** Курсор часа: { day: dayKey, idx: -1 } = «авто — пик дня», иначе выбранный час. */
  const [cursor, setCursor] = useState<{ day: string; idx: number }>({ day: 'none', idx: -1 });
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tables = useMemo(
    () => buildTables(restaurant.seats, restaurant.verandaActive ? restaurant.verandaSeats : 0),
    [restaurant.seats, restaurant.verandaActive, restaurant.verandaSeats],
  );

  const dayKey = state.lastDayResult ? `${state.lastDayResult.date.week}-${state.lastDayResult.date.day}` : 'none';

  // Пиковый час дня (максимум выручки) — дефолтный кадр нового дня.
  const peakIdx = useMemo(() => {
    let best = 0;
    hourLogs.forEach((h, i) => {
      if (h.revenue > hourLogs[best].revenue) best = i;
    });
    return best;
  }, [hourLogs]);

  // Эффективный индекс часа БЕЗ setState в effect: если день сменился — курсор «протух»,
  // рендер сам отдаёт пик нового дня; слайдер/кнопки пишут актуальную пару {day, idx}.
  const maxIdx = Math.max(0, hourLogs.length - 1);
  const hourIdx = cursor.day === dayKey && cursor.idx >= 0 ? Math.min(cursor.idx, maxIdx) : Math.min(peakIdx, maxIdx);
  const setHourIdx = (idx: number) => setCursor({ day: dayKey, idx });

  // Занятые столы (хук — ДО раннего return, правила хуков).
  const busyIds = useMemo(() => {
    const hour = hourLogs[Math.min(hourIdx, maxIdx)];
    if (!hour) return new Set<string>();
    const totalSeats = restaurant.seats + (restaurant.verandaActive ? restaurant.verandaSeats : 0);
    const occupiedFraction = Math.min(1, hour.seated / Math.max(1, totalSeats * 0.55));
    const busyCount = Math.round(occupiedFraction * tables.length);
    const sorted = [...tables].sort((a, b) => a.desirability - b.desirability);
    return new Set(sorted.slice(0, busyCount).map((t) => t.id));
  }, [hourLogs, hourIdx, maxIdx, tables, restaurant.seats, restaurant.verandaActive, restaurant.verandaSeats]);

  // Автовоспроизведение: ~650 мс на час, стоп в конце.
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => {
      setCursor((c) => {
        if (c.day !== dayKey) return { day: dayKey, idx: 1 };
        if (c.idx < 0 ? peakIdx >= maxIdx : c.idx >= maxIdx) {
          setPlaying(false);
          return c;
        }
        return { day: c.day, idx: (c.idx < 0 ? peakIdx : c.idx) + 1 };
      });
    }, 650);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, hourLogs.length, dayKey, peakIdx, maxIdx]);

  if (hourLogs.length === 0) {
    return <EmptyState text="Проведите первый день — и зал оживёт: столы, очередь, кухня" />;
  }

  const hour: HourLog = hourLogs[hourIdx];
  const totalSeats = restaurant.seats + (restaurant.verandaActive ? restaurant.verandaSeats : 0);

  // Доля занятых столов в этот час: seated/(totalSeats × оборот ~2,4 посадки/место за день).
  // Час «видит» одновременно seated гостей за столами — визуализируем именно их.
  const occupiedFraction = Math.min(1, hour.seated / Math.max(1, totalSeats * 0.55));

  const queueCount = Math.min(12, Math.round(hour.queueAvg));
  const isVerandaSeason = restaurant.verandaActive; // сезонность двигок уже учёл активность

  const hourLabel = `${hour.hour}:00`;

  return (
    <div className="space-y-3">
      {/* Панель управления воспроизведением */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Первый час"
            onClick={() => { setHourIdx(0); setPlaying(false); }}
            className="h-8 w-8"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            aria-label={playing ? 'Пауза' : 'Воспроизвести день'}
            onClick={() => {
              if (!playing && hourIdx >= hourLogs.length - 1) setHourIdx(0);
              setPlaying(!playing);
            }}
            className="h-8 w-8 bg-amber-600 hover:bg-amber-700"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Последний час"
            onClick={() => { setHourIdx(hourLogs.length - 1); setPlaying(false); }}
            className="h-8 w-8"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-w-[180px]">
          <Slider
            value={[Math.min(hourIdx, hourLogs.length - 1)]}
            max={hourLogs.length - 1}
            step={1}
            onValueChange={(v) => { setHourIdx(v[0]); setPlaying(false); }}
            aria-label="Час дня"
          />
          <div className="mt-1 flex justify-between text-[10px] text-stone-400 tabular-nums">
            <span>08:00</span>
            <span>открытие</span>
            <span>закрытие</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-stone-900 leading-none">{hourLabel}</p>
          <p className="text-[11px] text-stone-500">
            {state.lastDayResult ? `нед ${state.lastDayResult.date.week}` : ''}
          </p>
        </div>
      </div>

      {/* KPI выбранного часа */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <HourStat label="За столами" value={hour.seated.toString()} icon={Users} />
        <HourStat label="В очереди" value={hour.queueAvg.toFixed(1)} icon={DoorOpen} tone={hour.queueAvg > 8 ? 'bad' : 'neutral'} />
        <HourStat label="Ушли" value={hour.lost.toString()} icon={AlertTriangle} tone={hour.lost > 3 ? 'bad' : 'neutral'} />
        <HourStat label="Выручка" value={money(hour.revenue)} />
        <HourStat label="Позиции" value={hour.orders.toString()} />
        <HourStat
          label="Удовл."
          value={`${hour.satisfaction}`}
          tone={hour.satisfaction >= 75 ? 'good' : hour.satisfaction >= 60 ? 'warn' : 'bad'}
        />
      </div>

      {/* СЦЕНА */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={`План зала ресторана, ${hourLabel}: ${hour.seated} гостей за столами, очередь ${hour.queueAvg.toFixed(1)}`}
        >
          <defs>
            <linearGradient id="hallFloor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafaf9" />
              <stop offset="100%" stopColor="#f0efee" />
            </linearGradient>
            <linearGradient id="kitchenFloor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e7e5e4" />
              <stop offset="100%" stopColor="#dcd9d6" />
            </linearGradient>
          </defs>

          {/* Пол зала */}
          <rect x={12} y={120} width={876} height={252} rx={14} fill="url(#hallFloor)" stroke="#d6d3d1" />

          {/* ===== КУХНЯ (полоса сверху) ===== */}
          <g>
            <rect
              x={KITCHEN.x}
              y={KITCHEN.y}
              width={KITCHEN.w}
              height={KITCHEN.h}
              rx={12}
              fill="url(#kitchenFloor)"
              stroke="#a8a29e"
            />
            <text x={KITCHEN.x + 12} y={KITCHEN.y + 20} fontSize={11} fontWeight={700} fill="#57534e" letterSpacing={1}>
              КУХНЯ
            </text>
            {STATION_ORDER.map((st, i) => {
              const load = hour.stationLoads[st] ?? 0;
              const level = load > 1 ? 'over' : load > 0.8 ? 'high' : load > 0 ? 'ok' : 'idle';
              const fill = level === 'over' ? '#fee2e2' : level === 'high' ? '#fef3c7' : level === 'ok' ? '#d1fae5' : '#f5f5f4';
              const stroke = level === 'over' ? '#dc2626' : level === 'high' ? '#d97706' : level === 'ok' ? '#059669' : '#a8a29e';
              const sw = KITCHEN.w / 6 - 8;
              const sx = KITCHEN.x + 6 + i * (KITCHEN.w / 6);
              return (
                <g key={st}>
                  <title>
                    {`${STATIONS[st].name}: загрузка ${(load * 100).toFixed(0)}% мощности. ${load > 1 ? 'ПЕРЕГРУЗ — позиции теряются!' : load > 0.8 ? 'Почти предел' : 'В норме'}`}
                  </title>
                  <rect
                    x={sx}
                    y={KITCHEN.y + 28}
                    width={sw}
                    height={58}
                    rx={8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={level === 'over' ? 2 : 1}
                    style={{ transition: 'fill .45s, stroke .45s' }}
                  />
                  <text x={sx + sw / 2} y={KITCHEN.y + 46} fontSize={9.5} textAnchor="middle" fill="#44403c" fontWeight={600}>
                    {STATIONS[st].name.length > 14 ? STATIONS[st].name.slice(0, 13) + '…' : STATIONS[st].name}
                  </text>
                  <text
                    x={sx + sw / 2}
                    y={KITCHEN.y + 62}
                    fontSize={13}
                    textAnchor="middle"
                    fontWeight={800}
                    fill={stroke}
                    style={{ transition: 'fill .45s' }}
                  >
                    {load > 0 ? `${Math.round(load * 100)}%` : '—'}
                  </text>
                  <rect
                    x={sx + 6}
                    y={KITCHEN.y + 68}
                    width={Math.max(0, sw - 12)}
                    height={4}
                    rx={2}
                    fill="#e7e5e4"
                  />
                  <rect
                    x={sx + 6}
                    y={KITCHEN.y + 68}
                    width={Math.max(0, (sw - 12) * Math.min(1.5, load))}
                    height={4}
                    rx={2}
                    fill={stroke}
                    style={{ transition: 'width .45s, fill .45s' }}
                  />
                </g>
              );
            })}
          </g>

          {/* Раздаточная (pass) */}
          <rect x={KITCHEN.x} y={KITCHEN.y + KITCHEN.h + 4} width={KITCHEN.w} height={10} rx={5} fill="#fde68a" stroke="#d97706" strokeWidth={0.6} />
          <text x={KITCHEN.x + KITCHEN.w / 2} y={KITCHEN.y + KITCHEN.h + 11.5} fontSize={7} textAnchor="middle" fill="#92400e" fontWeight={700} letterSpacing={1.4}>
            PASS · РАЗДАТОЧНАЯ
          </text>

          {/* ===== ВЕРАНДА (правая зона) ===== */}
          <g>
            <rect
              x={VERANDA.x}
              y={VERANDA.y}
              width={VERANDA.w}
              height={VERANDA.h}
              rx={12}
              fill={isVerandaSeason ? '#f0fdf4' : '#f5f5f4'}
              stroke={isVerandaSeason ? '#86efac' : '#d6d3d1'}
              strokeDasharray="7 5"
            />
            <text x={VERANDA.x + 14} y={VERANDA.y + 22} fontSize={11} fontWeight={700} fill={isVerandaSeason ? '#15803d' : '#a8a29e'}>
              ВЕРАНДА {isVerandaSeason ? `· +${restaurant.verandaSeats} мест` : '· закрыта'}
            </text>
            {!isVerandaSeason && (
              <text x={VERANDA.x + VERANDA.w / 2} y={VERANDA.y + 180} fontSize={10} textAnchor="middle" fill="#a8a29e">
                Открыта с мая по сентябрь
              </text>
            )}
          </g>

          {/* ===== ОКНА (левая стена) ===== */}
          <g>
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x={26}
                y={136 + i * 46}
                width={16}
                height={32}
                rx={3}
                fill="#bae6fd"
                stroke="#7dd3fc"
                strokeWidth={0.8}
                opacity={0.85}
              >
                <title>Окно: столики у окон занимаются в вторую очередь после центра</title>
              </rect>
            ))}
          </g>

          {/* ===== СТОЛЫ ===== */}
          {tables.map((t) => {
            const busy = busyIds.has(t.id);
            const fill = busy ? (t.zone === 'veranda' ? '#bbf7d0' : '#fcd34d') : '#e7e5e4';
            const stroke = busy ? '#d97706' : '#a8a29e';
            const r = t.seats === 2 ? 13 : 19;
            const guests = busy ? t.seats : 0;
            return (
              <g key={t.id} style={{ transition: 'opacity .3s' }}>
                <title>
                  {`Столик ${t.seats}-местный (${t.zone === 'center' ? 'центр зала' : t.zone === 'window' ? 'у окна' : 'веранда'}): ${busy ? `занят — ${guests} гост(я/ей)` : 'свободен'}`}
                </title>
                {/* тень */}
                <ellipse cx={t.x} cy={t.y + 4} rx={r + 2} ry={(r + 2) * 0.5} fill="#000" opacity={0.06} />
                {/* столешница */}
                {t.seats === 2 ? (
                  <circle cx={t.x} cy={t.y} r={r} fill={fill} stroke={stroke} strokeWidth={1.4} style={{ transition: 'fill .5s, stroke .5s' }} />
                ) : (
                  <rect x={t.x - r} y={t.y - r * 0.78} width={r * 2} height={r * 1.56} rx={10} fill={fill} stroke={stroke} strokeWidth={1.4} style={{ transition: 'fill .5s, stroke .5s' }} />
                )}
                {/* гости — точки вокруг стола */}
                {busy &&
                  Array.from({ length: guests }).map((_, gi) => {
                    const angle = (2 * Math.PI * gi) / guests - Math.PI / 2;
                    const gx = t.x + Math.cos(angle) * (r + 8);
                    const gy = t.y + Math.sin(angle) * (r + 8) * 0.72;
                    return <circle key={gi} cx={gx} cy={gy} r={4.4} fill="#78350f" opacity={0.85} />;
                  })}
              </g>
            );
          })}

          {/* ===== БАР-СТОЙКА у правой стены зала ===== */}
          <g>
            <title>Бар: напитки и кофе отсюда уходят на столы</title>
            <rect x={770} y={352} width={106} height={14} rx={7} fill="#d6d3d1" stroke="#a8a29e" />
            <text x={823} y={349} fontSize={9} textAnchor="middle" fill="#57534e" fontWeight={600}>БАР</text>
            <circle cx={792} cy={359} r={4} fill="#78350f" opacity={hour.stationLoads.bar_service ? 0.9 : 0.25} />
            <circle cx={810} cy={359} r={4} fill="#78350f" opacity={hour.stationLoads.bar_service ? 0.6 : 0.2} />
            <circle cx={828} cy={359} r={4} fill="#78350f" opacity={hour.stationLoads.bar_service ? 0.4 : 0.15} />
          </g>

          {/* ===== ВХОД, ХОСТЕС, ОЧЕРЕДЬ ===== */}
          <g>
            {/* Стена с дверью */}
            <rect x={300} y={H - 64} width={300} height={14} rx={4} fill="#d6d3d1" />
            {/* Дверь */}
            <rect
              x={ENTRANCE.x + 44}
              y={H - 62}
              width={44}
              height={34}
              rx={4}
              fill="#fde68a"
              stroke="#d97706"
            />
            <text x={ENTRANCE.x + 66} y={H - 41} fontSize={8.5} textAnchor="middle" fontWeight={700} fill="#92400e" letterSpacing={0.6}>
              ВХОД
            </text>

            {/* Очередь: человечки слева от входа */}
            {Array.from({ length: queueCount }).map((_, i) => {
              const qx = 300 - 18 - Math.floor(i / 4) * 20;
              const qy = H - 48 + (i % 4) * 12;
              return (
                <g key={i}>
                  <title>{`Очередь: ${hour.queueAvg.toFixed(1)} гостей ждут посадки (в среднем за этот час)`}</title>
                  <circle cx={qx} cy={qy - 8} r={4.6} fill="#fb923c" opacity={0.9} />
                  <rect x={qx - 4} y={qy - 3} width={8} height={12} rx={3.4} fill="#fb923c" opacity={0.9} />
                </g>
              );
            })}
            {queueCount === 0 && (
              <text x={252} y={H - 30} fontSize={9.5} fill="#059669" fontWeight={600}>
                очереди нет
              </text>
            )}

            {/* Хостес */}
            <g>
              <title>Хостес сажает гостей: до 45 гостей/час. Узкое место при очереди — наймите/поставьте хостес.</title>
              <rect x={ENTRANCE.x + 104} y={H - 56} width={40} height={30} rx={6} fill="#d1fae5" stroke="#059669" />
              <text x={ENTRANCE.x + 124} y={H - 37} fontSize={8.5} textAnchor="middle" fill="#065f46" fontWeight={700}>
                ХОСТЕС
              </text>
            </g>
          </g>

          {/* Счётчик занятости */}
          <g>
            <rect x={660} y={H - 58} width={220} height={38} rx={8} fill="#fafaf9" stroke="#d6d3d1" />
            <text x={674} y={H - 40} fontSize={9} fill="#78716c" fontWeight={600}>
              ЗАГРУЗКА ЗАЛА
            </text>
            <text x={674} y={H - 26} fontSize={13} fontWeight={800} fill={occupiedFraction > 0.85 ? '#dc2626' : occupiedFraction > 0.6 ? '#d97706' : '#059669'}>
              {Math.round(occupiedFraction * 100)}%
            </text>
            <rect x={746} y={H - 34} width={120} height={8} rx={4} fill="#e7e5e4" />
            <rect
              x={746}
              y={H - 34}
              width={Math.max(2, 120 * occupiedFraction)}
              height={8}
              rx={4}
              fill={occupiedFraction > 0.85 ? '#dc2626' : occupiedFraction > 0.6 ? '#d97706' : '#059669'}
              style={{ transition: 'width .5s, fill .5s' }}
            />
          </g>
        </svg>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
        <span className="font-semibold text-stone-700 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-amber-700" />
          Легенда:
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-stone-300" /> стол свободен
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-300 ring-1 ring-amber-600" /> стол занят
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-orange-400" /> очередь (гость)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-600" /> станция в норме
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-200 ring-1 ring-amber-600" /> станция близка к пределу
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-200 ring-2 ring-red-600" /> перегруз — потери позиций
        </span>
        <span className="ml-auto flex items-center gap-1">
          <InfoHint
            hint={{
              title: 'Зал ресторана',
              body: 'План зала воспроизводит последний прожитый день по часам: сколько гостей сидело, кто ждал в очереди, как нагружалась кухня. Заполнение столов — наглядная оценка одновременной посадки, а не учёт конкретных столиков.',
              advice: 'Ищите узкое место: красная станция = наймите повара этой роли; длинная очередь = хостес/места; пустые столы при очереди = медленная уборка (уборщики).',
            }}
          />
        </span>
      </div>
    </div>
  );
}

function HourStat({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  icon?: typeof Users;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  return (
    <div className="rounded-lg border border-stone-100 bg-white px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-400">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {label}
      </p>
      <p
        className={cn(
          'text-sm font-bold tabular-nums',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-700',
          tone === 'warn' && 'text-amber-700',
          tone === 'neutral' && 'text-stone-800',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Экспорт для использования табом «Зал» на главном экране. */
export { VERANDA as VERANDA_ZONE };

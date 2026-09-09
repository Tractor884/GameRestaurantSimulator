/**
 * Визард открытия ресторана (ТЗ §9): 7 шагов.
 * Живой расчёт бюджета: взнос 12 млн + кредит − ремонт − оборудование − депозит.
 */
'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGame } from '@/lib/game/store/gameStore';
import { LOCATIONS } from '@/lib/game/config/locations.config';
import {
  PREMISES_SIZES,
  RENOVATION_LEVELS,
  EQUIPMENT_COSTS,
  EQUIPMENT_LEVELS,
  VERANDA,
} from '@/lib/game/config/premises.config';
import { alcoholLicenseAnnual, verandaParams, BALANCE_V2_5, isLegacy } from '@/lib/game/config/balance2.config';
import { DIFFICULTIES } from '@/lib/game/config/difficulty.config';
import { annuityPayment } from '@/lib/game/config/loans.config';
import { DISHES_MAP, STARTER_MENU_IDS, recipeFoodCost } from '@/lib/game/content/dishes';
import { MENU_CATEGORIES } from '@/lib/game/config/menu.config';
import { cn } from '@/lib/utils';
import { moneyShort, money, RangeBadge } from './widgets';
import type { Dish, EquipmentLevel, PremisesSize, RenovationLevel } from '@/lib/game/types';
import {
  MapPin,
  Building2,
  Paintbrush,
  CookingPot,
  Landmark,
  UtensilsCrossed,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Check,
  Gauge,
} from 'lucide-react';

const STEPS = [
  { id: 'difficulty', label: 'Сложность', icon: Gauge },
  { id: 'district', label: 'Район', icon: MapPin },
  { id: 'premises', label: 'Помещение', icon: Building2 },
  { id: 'renovation', label: 'Ремонт', icon: Paintbrush },
  { id: 'equipment', label: 'Оборудование', icon: CookingPot },
  { id: 'loan', label: 'Кредит', icon: Landmark },
  { id: 'menu', label: 'Меню', icon: UtensilsCrossed },
  { id: 'launch', label: 'Запуск', icon: Rocket },
] as const;

export function SetupWizard() {
  const startGame = useGame((s) => s.startGame);
  const [step, setStep] = useState(0);
  const [difficultyId, setDifficultyId] = useState<string>('standard');
  const [locationId, setLocationId] = useState('tverskaya');
  const [premisesSize, setPremisesSize] = useState<PremisesSize>('medium');
  const [renovation, setRenovation] = useState<RenovationLevel>('standard');
  const [equip, setEquip] = useState<{ kitchen: EquipmentLevel; coffee: EquipmentLevel; hall: EquipmentLevel }>({
    kitchen: 'standard',
    coffee: 'standard',
    hall: 'standard',
  });
  const [loanAmount, setLoanAmount] = useState(12_000_000);
  const [veranda, setVeranda] = useState(true);
  const [alcohol, setAlcohol] = useState(true);
  const [name, setName] = useState('«Ложка-Поварёшка»');
  const [menuIds, setMenuIds] = useState<string[]>([...STARTER_MENU_IDS]);

  const loc = LOCATIONS.find((l) => l.id === locationId)!;
  const prem = PREMISES_SIZES[premisesSize];
  const diff = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.standard;

  const costs = useMemo(() => {
    const renovationCost = prem.areaM2 * loc.renovationCostPerM2[renovation];
    const equipmentCost =
      EQUIPMENT_COSTS[equip.kitchen].kitchen + EQUIPMENT_COSTS[equip.coffee].coffee + EQUIPMENT_COSTS[equip.hall].hall;
    const rent = Math.round(prem.areaM2 * loc.rentPerM2);
    const deposit = rent * loc.depositMonths;
    const verandaCost = veranda ? verandaParams().setupCost : 0;
    const licenseCost = alcohol ? alcoholLicenseAnnual() : 0;
    const budget = diff.ownerEquity + loanAmount;
    const spent = renovationCost + equipmentCost + deposit + verandaCost + licenseCost;
    return {
      renovationCost, equipmentCost, rent, deposit, verandaCost, licenseCost, budget, spent,
      left: budget - spent - 1_000_000, // запас на оборотку
      monthly: annuityPayment(loanAmount, diff.loanRate, diff.loanTermMonths),
    };
  }, [prem, loc, renovation, equip, loanAmount, veranda, alcohol, diff]);

  const launch = () => {
    startGame({
      seed: Math.floor(Math.random() * 1_000_000) + 1000,
      restaurantName: name,
      difficultyId: diff.id,
      locationId,
      premisesSize,
      renovation,
      loanAmount,
      equipment: equip,
      veranda,
      alcoholLicense: alcohol,
      menuIds,
    });
  };

  const canNext = () => {
    if (step === 6) return menuIds.length >= 12;
    return true;
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Заголовок */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900">Открытие ресторана в Москве</h1>
            <p className="text-sm text-stone-500">Casual Dining · Средний чек 3500+ ₽ · 52 недели до финальной оценки</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500 uppercase tracking-wide">Бюджет открытия</p>
            <p className="text-lg font-bold tabular-nums text-stone-900">{moneyShort(costs.budget)}</p>
          </div>
        </div>
      </header>

      {/* Шаги */}
      <div className="border-b border-stone-200 bg-white/70">
        <div className="max-w-6xl mx-auto px-4 py-3 flex gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i <= step && setStep(i)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                i === step
                  ? 'bg-amber-100 text-amber-900 font-semibold'
                  : i < step
                    ? 'text-emerald-700 hover:bg-stone-100'
                    : 'text-stone-400',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="h-4 w-4" aria-hidden /> : <s.icon className="h-4 w-4" aria-hidden />}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Контент */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Шаг 0 — сложность (ТЗ §36) */}
          {step === 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-bold text-stone-900">Сложность года</h2>
                <p className="text-sm text-stone-500">
                  Влияет на стартовый капитал, ставку кредита, чувствительность гостей к ценам,
                    частоту событий и планки победы на 52-й неделе. Экономика ресторана одинакова — отличается цена ошибки.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {Object.values(DIFFICULTIES).map((d) => {
                  const selected = difficultyId === d.id;
                  return (
                    <Card
                      key={d.id}
                      className={cn(
                        'cursor-pointer border transition-all hover:shadow-md',
                        selected ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200',
                      )}
                      onClick={() => setDifficultyId(d.id)}
                      aria-pressed={selected}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-lg',
                                d.id === 'novice' && 'bg-emerald-100 text-emerald-700',
                                d.id === 'standard' && 'bg-amber-100 text-amber-700',
                                d.id === 'professional' && 'bg-red-100 text-red-700',
                              )}
                              aria-hidden
                            >
                              <Gauge className="h-4 w-4" />
                            </span>
                            <p className="font-semibold text-stone-900">{d.name}</p>
                          </div>
                          {selected && <Badge className="bg-amber-500 text-white">Выбран</Badge>}
                        </div>
                        <p className="text-sm text-stone-600 min-h-[60px]">{d.description}</p>
                        <ul className="space-y-1.5">
                          {d.highlights.map((h) => (
                            <li key={h} className="flex items-start gap-1.5 text-xs text-stone-600">
                              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                              {h}
                            </li>
                          ))}
                        </ul>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded-md bg-stone-50 p-1.5">
                            <p className="text-[10px] uppercase text-stone-400">Взнос</p>
                            <p className="text-xs font-bold tabular-nums text-stone-800">{moneyShort(d.ownerEquity)}</p>
                          </div>
                          <div className="rounded-md bg-stone-50 p-1.5">
                            <p className="text-[10px] uppercase text-stone-400">Ставка</p>
                            <p className="text-xs font-bold tabular-nums text-stone-800">{(d.loanRate * 100).toFixed(0)}%</p>
                          </div>
                          <div className="rounded-md bg-stone-50 p-1.5">
                            <p className="text-[10px] uppercase text-stone-400">Победа</p>
                            <p className="text-xs font-bold tabular-nums text-stone-800">{moneyShort(d.winConditions.minCumulativeProfit)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid md:grid-cols-2 gap-4">
              {LOCATIONS.map((l) => (
                <Card
                  key={l.id}
                  className={cn(
                    'cursor-pointer border transition-all hover:shadow-md',
                    locationId === l.id ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200',
                  )}
                  onClick={() => setLocationId(l.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-stone-900">{l.name}</p>
                        <p className="text-xs text-amber-700 font-medium">{l.typeLabel}</p>
                      </div>
                      {locationId === l.id && <Badge className="bg-amber-500 text-white">Выбран</Badge>}
                    </div>
                    <p className="text-sm text-stone-600 mt-2">{l.description}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                      <div className="rounded-md bg-stone-50 p-2">
                        <p className="text-stone-500">Трафик</p>
                        <p className="font-bold tabular-nums text-stone-800">{l.baseTraffic}/день</p>
                      </div>
                      <div className="rounded-md bg-stone-50 p-2">
                        <p className="text-stone-500">Аренда</p>
                        <p className="font-bold tabular-nums text-stone-800">{l.rentPerM2.toLocaleString('ru-RU')} ₽/м²</p>
                      </div>
                      <div className="rounded-md bg-stone-50 p-2">
                        <p className="text-stone-500">Конкуренция</p>
                        <p className="font-bold tabular-nums text-stone-800">{((1 - l.competitionFactor) * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid md:grid-cols-3 gap-4">
              {(Object.keys(PREMISES_SIZES) as PremisesSize[]).map((size) => {
                const p = PREMISES_SIZES[size];
                const rent = Math.round(p.areaM2 * loc.rentPerM2);
                return (
                  <Card
                    key={size}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      premisesSize === size ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200',
                    )}
                    onClick={() => setPremisesSize(size)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-stone-900">{p.label}</p>
                        {premisesSize === size && <Badge className="bg-amber-500 text-white">Выбран</Badge>}
                      </div>
                      <div className="space-y-1 text-sm text-stone-600">
                        <p>Мест: <b className="tabular-nums">{p.seats}</b></p>
                        <p>Площадь: <b className="tabular-nums">{p.areaM2} м²</b></p>
                        <p>Аренда: <b className="tabular-nums">{money(rent)}</b>/мес</p>
                        <p>Депозит: <b className="tabular-nums">{money(rent * loc.depositMonths)}</b></p>
                        <p>Коммунальные: <b className="tabular-nums">{money(Math.round(p.areaM2 * loc.utilitiesPerM2))}</b>/мес</p>
                      </div>
                      <p className="text-xs text-stone-500">
                        {size === 'small' && 'Ниже аренда и потенциал выручки.'}
                        {size === 'medium' && 'Базовый вариант по ТЗ: 70 мест, 200 м².'}
                        {size === 'large' && 'Выше выручка, но выше постоянные расходы.'}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="grid md:grid-cols-2 gap-4">
              {(Object.keys(RENOVATION_LEVELS) as RenovationLevel[]).map((lvl) => {
                const r = RENOVATION_LEVELS[lvl];
                const cost = prem.areaM2 * loc.renovationCostPerM2[lvl];
                return (
                  <Card
                    key={lvl}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      renovation === lvl ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200',
                    )}
                    onClick={() => setRenovation(lvl)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-stone-900">{r.label}</p>
                        <span className="font-bold tabular-nums text-stone-800">{moneyShort(cost)}</span>
                      </div>
                      <p className="text-sm text-stone-600">{r.description}</p>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="secondary" className="bg-stone-100">Комфорт {r.comfortBase}</Badge>
                        <Badge variant="secondary" className="bg-stone-100">Атмосфера {r.atmosphereBase}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {(['kitchen', 'coffee', 'hall'] as const).map((zone) => {
                const labels = { kitchen: 'Кухня (горячий + холодный цех + заготовка)', coffee: 'Кофейная станция', hall: 'Зал и посуда' };
                return (
                  <Card key={zone} className="border-stone-200">
                    <CardContent className="p-4">
                      <p className="font-semibold text-stone-900 mb-3">{labels[zone]}</p>
                      <div className="grid grid-cols-3 gap-3">
                        {(Object.keys(EQUIPMENT_LEVELS) as EquipmentLevel[]).map((lvl) => {
                          const cfg = EQUIPMENT_LEVELS[lvl];
                          const cost = EQUIPMENT_COSTS[lvl][zone];
                          return (
                            <button
                              key={lvl}
                              onClick={() => setEquip((e) => ({ ...e, [zone]: lvl }))}
                              className={cn(
                                'rounded-xl border p-3 text-left transition-all hover:shadow-sm',
                                equip[zone] === lvl ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50' : 'border-stone-200 bg-white',
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-semibold text-sm text-stone-900">{cfg.label}</p>
                                {equip[zone] === lvl && <Check className="h-4 w-4 text-amber-600" aria-hidden />}
                              </div>
                              <p className="text-xs text-stone-500">Скорость ×{cfg.throughputFactor}</p>
                              <p className="text-xs text-stone-500">Качество ×{cfg.qualityFactor}</p>
                              <p className="text-sm font-bold tabular-nums text-stone-800 mt-1">{moneyShort(cost)}</p>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {step === 5 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-stone-200">
                <CardContent className="p-5 space-y-5">
                  <div>
                    <p className="font-semibold text-stone-900 mb-1">Кредит на открытие</p>
                    <p className="text-sm text-stone-500">
                      Ставка {diff.loanRate * 100}%, срок {diff.loanTermMonths} мес, аннуитет, первый платёж через 4 недели.
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-stone-600">Сумма кредита</span>
                      <span className="font-bold tabular-nums text-stone-900">{moneyShort(loanAmount)}</span>
                    </div>
                    <Slider
                      value={[loanAmount]}
                      min={0}
                      max={Math.min(diff.maxLoan, diff.loanLimitMultiplier * diff.ownerEquity)}
                      step={500_000}
                      onValueChange={(v) => setLoanAmount(v[0])}
                      aria-label="Сумма кредита"
                    />
                    <p className="text-xs text-stone-500 mt-2">
                      Платёж каждые 4 недели: <b className="tabular-nums">{money(costs.monthly)}</b>
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                    <div>
                      <p className="font-medium text-stone-800 text-sm">Летняя веранда</p>
                      <p className="text-xs text-stone-500">
                        +{VERANDA.seats} мест и +{Math.round((BALANCE_V2_5.veranda.demandLift - 1) * 100)}% спроса в сезон · {moneyShort(verandaParams().setupCost)}
                        {!isLegacy() && ` + ${moneyShort(verandaParams().monthlyCost)}/мес · погода режет дни`}
                      </p>
                    </div>
                    <Switch checked={veranda} onCheckedChange={setVeranda} aria-label="Веранда" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                    <div>
                      <p className="font-medium text-stone-800 text-sm">Лицензия на алкоголь</p>
                      <p className="text-xs text-stone-500">
                        +выручка с вина и пива · {moneyShort(alcoholLicenseAnnual())}/год
                        {!isLegacy() && ` + ${moneyShort(BALANCE_V2_5.alcohol.complianceMonthly)}/мес комплаенс · инциденты и проверки`}
                      </p>
                    </div>
                    <Switch checked={alcohol} onCheckedChange={setAlcohol} aria-label="Лицензия на алкоголь" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-stone-200 bg-white">
                <CardContent className="p-5">
                  <p className="font-semibold text-stone-900 mb-3">Смета открытия</p>
                  <div className="space-y-2 text-sm">
                    <Row label="Взнос владельца" value={money(diff.ownerEquity)} tone="good" />
                    <Row label="Кредит банка" value={money(loanAmount)} tone="good" />
                    <div className="border-t border-stone-100 my-2" />
                    <Row label={`Ремонт (${RENOVATION_LEVELS[renovation].label.toLowerCase()})`} value={money(-costs.renovationCost)} />
                    <Row label="Оборудование" value={money(-costs.equipmentCost)} />
                    <Row label={`Депозит (${loc.depositMonths} мес аренды)`} value={money(-costs.deposit)} />
                    {veranda && <Row label="Веранда" value={money(-costs.verandaCost)} />}
                    {alcohol && <Row label="Лицензия на алкоголь" value={money(-costs.licenseCost)} />}
                    <div className="border-t border-stone-100 my-2" />
                    <Row label="Остаток на оборотку и запас" value={money(costs.left)} tone={costs.left >= 1_500_000 ? 'good' : 'bad'} bold />
                  </div>
                  {costs.left < 1_500_000 && (
                    <p className="text-xs text-red-700 mt-3 bg-red-50 rounded-lg p-2">
                      ⚠️ Мало денег на оборотку: закупки, зарплату и первый платёж по кредиту. Уменьшите кредит невозможно —
                      сократите ремонт или оборудование.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {step === 6 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-900">Меню открытия</p>
                  <p className="text-sm text-stone-500">
                    Выбрано {menuIds.length} блюд. Минимум 12, рекомендуется 25–45. Цены — рекомендуемые, потом скорректируете.
                  </p>
                </div>
                <Badge className={cn(menuIds.length >= 25 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
                  {menuIds.length} / 60
                </Badge>
              </div>
              <ScrollArea className="h-[420px] rounded-xl border border-stone-200 bg-white">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                  {Object.values(DISHES_MAP as Record<string, Dish>).map((dish) => {
                    const on = menuIds.includes(dish.id);
                    const fc = recipeFoodCost(dish);
                    return (
                      <button
                        key={dish.id}
                        onClick={() =>
                          setMenuIds((m) => (on ? m.filter((x) => x !== dish.id) : [...m, dish.id]))
                        }
                        className={cn(
                          'rounded-lg border p-2.5 text-left transition-all',
                          on ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white hover:border-stone-300',
                        )}
                        aria-pressed={on}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium text-stone-800 leading-tight">{dish.name}</p>
                          {dish.requiresAlcoholLicense && !alcohol && (
                            <Badge variant="secondary" className="bg-red-50 text-red-700 shrink-0 text-[10px]">нужна лицензия</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant="secondary" className="bg-stone-100 text-stone-600 text-[10px]">
                            {MENU_CATEGORIES[dish.category].label}
                          </Badge>
                          <span className="text-xs font-semibold tabular-nums text-stone-700">{dish.recommendedPrice} ₽</span>
                          <RangeBadge value={fc * 100} min={0} max={MENU_CATEGORIES[dish.category].targetFoodCost * 100} label="FC" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === 7 && (
            <div className="max-w-xl mx-auto space-y-4">
              <Card className="border-stone-200">
                <CardContent className="p-5 space-y-4">
                  <div>
                    <label htmlFor="rest-name" className="text-sm font-medium text-stone-700">Название ресторана</label>
                    <Input
                      id="rest-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                      maxLength={40}
                    />
                  </div>
                  <div className="rounded-xl bg-stone-50 p-4 space-y-1.5 text-sm">
                    <Row label="Сложность" value={`${diff.name} · победа с ${moneyShort(diff.winConditions.minCumulativeProfit)} прибыли и рейтингом ${diff.winConditions.minRating}`} />
                    <Row label="Район" value={loc.name} />
                    <Row label="Помещение" value={`${prem.label}: ${prem.seats} мест, ${prem.areaM2} м²`} />
                    <Row label="Ремонт" value={`${RENOVATION_LEVELS[renovation].label} (${moneyShort(costs.renovationCost)})`} />
                    <Row label="Оборудование" value={`${EQUIPMENT_LEVELS[equip.kitchen].label} (${moneyShort(costs.equipmentCost)})`} />
                    <Row label="Кредит" value={`${moneyShort(loanAmount)} · платёж ${money(costs.monthly)}/4 нед`} />
                    <Row label="Меню" value={`${menuIds.length} блюд`} />
                    <Row label="На оборотку" value={money(costs.left)} tone={costs.left >= 1_500_000 ? 'good' : 'bad'} bold />
                  </div>
                  <p className="text-xs text-stone-500">
                    Штат по умолчанию: сбалансированный график смен. Скорректируете на экране «Персонал».
                    Стартовые закупки выполнятся автоматически.
                  </p>
                  <Button
                    onClick={launch}
                    size="lg"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white text-base"
                  >
                    <Rocket className="h-5 w-5 mr-2" aria-hidden />
                    Открыть ресторан!
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Навигация */}
      <footer className="border-t border-stone-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
            Назад
          </Button>
          <p className="text-xs text-stone-500 hidden sm:block">
            Шаг {step + 1} из {STEPS.length}
          </p>
          {step < 7 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="bg-stone-800 hover:bg-stone-900 text-white"
            >
              Далее
              <ArrowRight className="h-4 w-4 ml-1" aria-hidden />
            </Button>
          ) : (
            <div className="w-20" />
          )}
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: 'good' | 'bad'; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={cn('text-stone-600', bold && 'font-semibold text-stone-800')}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          tone === 'good' && 'text-emerald-700 font-semibold',
          tone === 'bad' && 'text-red-700 font-semibold',
          !tone && 'text-stone-800',
          bold && 'font-bold',
        )}
      >
        {value}
      </span>
    </div>
  );
}

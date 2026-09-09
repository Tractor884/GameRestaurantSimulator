/**
 * Экран «Лицензии» (ТЗ §31.4 п.11): алкогольная лицензия, веранда,
 * санитарная обработка.
 *
 * v2 этап 5 (§16): алкоголь = комплаенс/инциденты/проверки полиции +
 * доля бара в выручке; веранда = погода/сезонный найм/демонтаж.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, MetricRow, money } from '../widgets';
import { ALCOHOL_LICENSE, VERANDA } from '@/lib/game/config/premises.config';
import { alcoholLicenseAnnual, verandaParams, BALANCE_V2_2, BALANCE_V2_5, isLegacy } from '@/lib/game/config/balance2.config';
import { CLEANING } from '@/lib/game/config/marketing.config';
import { dishOf } from '@/lib/game/content/resolve';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Sun, ShieldAlert, CheckCircle2, AlertTriangle, Sparkles, CloudRain, Users } from 'lucide-react';

/** Месяц по дате (для сезона веранды). */
function monthOf(week: number, day: number): number {
  const doy = (week - 1) * 7 + day;
  return Math.min(12, Math.floor(doy / 30.4) + 1);
}

export function LicensesScreen() {
  const state = useGame((s) => s.state)!;
  const restaurant = state.restaurant!;
  const license = useGame((s) => s.license);
  const hireSeasonal = useGame((s) => s.hireSeasonal);
  const deepClean = useGame((s) => s.deepClean);
  const disabled = state.phase === 'gameover';

  const alcohol = restaurant.licenses.alcohol;
  const alcoholActive = !!alcohol?.active;
  const alcoholDishesInMenu = restaurant.menu.dishes.filter(
    (id) => dishOf(restaurant.menu, id)?.requiresAlcoholLicense,
  ).length;
  const alc = BALANCE_V2_5.alcohol;
  const licenseCost = alcoholLicenseAnnual();
  const complianceMonthly = isLegacy() ? 0 : alc.complianceMonthly;
  const incidentsQuarter = (restaurant.alcoholIncidents ?? []).length;

  // Веранда: сезон по текущей дате.
  const monthNow = monthOf(state.week, state.day);
  const inSeason = VERANDA.months.includes(monthNow);
  const vp = verandaParams();
  const waiters = restaurant.staff.pools.waiter.count;
  const veranda = BALANCE_V2_5.veranda;

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
              value={money(licenseCost)}
              hint="Амортизируется в P&L: годовая сумма равномерно по неделям"
            />
            <MetricRow
              label="Комплаенс"
              value={complianceMonthly > 0 ? `${money(complianceMonthly)}/мес` : '—'}
              hint="alcoholBar"
              tone={complianceMonthly > 0 ? 'neutral' : 'good'}
            />
            <MetricRow
              label="Юридический риск"
              value={alcoholActive ? `−${ALCOHOL_LICENSE.legalRiskReduction} п. + комплаенс` : 'растёт'}
              hint="Лицензия снижает риск, но продажа алкоголя добавляет регуляторную нагрузку"
              tone={alcoholActive ? 'neutral' : 'bad'}
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
                  ? `Лицензия активна. Бар — источник выручки и постоянных забот: «пьяные инциденты» (компенсация ${money(alc.incidentCompensation[0])}–${money(alc.incidentCompensation[1])} + удар по репутации), проверки полиции (~${Math.round(alc.policePerYear)}/год, штрафы ${money(alc.policeFine[0])}–${money(alc.policeFine[1])}), официанты устают быстрее (×${alc.bartenderFatigueMult}). Два инцидента за квартал — разговор «ограничить продажи вечером».`
                  : 'Без лицензии движок блокирует продажи алкоголя: позиции не приносят выручки, а юридический риск растёт каждую неделю (+1,5 п.п. за позиции в меню).'}
              </p>
            </div>
            {!alcoholActive && (
              <Button
                className="h-11 w-full bg-amber-600 hover:bg-amber-700 text-white"
                onClick={license}
                disabled={disabled}
              >
                <FileCheck className="h-4 w-4 mr-1.5" aria-hidden />
                Купить на год — {money(licenseCost)}
                {complianceMonthly > 0 && ` + ${money(complianceMonthly)}/мес`}
              </Button>
            )}
            {alcoholActive && incidentsQuarter > 0 && (
              <div
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" aria-hidden />
                <p>
                  Пьяных инцидентов в этом квартале: <strong>{incidentsQuarter}</strong>
                  {incidentsQuarter >= alc.incidentDilemmaAt
                    ? ' — при следующем повторе ждите дилемму «ограничить продажи вечером».'
                    : ' — следите за динамикой.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Веранда */}
      <SectionCard title="Летняя веранда" icon={Sun}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {restaurant.verandaActive ? (
                <>
                  <Badge className={inSeason ? 'bg-emerald-600 text-white hover:bg-emerald-600' : 'bg-stone-200 text-stone-700 hover:bg-stone-200'}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                    {inSeason ? 'Сезон открыт' : 'Вне сезона'}
                  </Badge>
                  <span className="text-sm text-stone-600">
                    +{restaurant.verandaSeats} мест к залу
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="bg-stone-100 text-stone-600">
                    Нет веранды
                  </Badge>
                  <span className="text-sm text-stone-600">
                    посадка зала {restaurant.seats} мест
                  </span>
                </>
              )}
            </div>
            <MetricRow
              label="Дополнительные места"
              value={restaurant.verandaActive ? `+${restaurant.verandaSeats} (май–сент)` : '—'}
            />
            <MetricRow
              label="Сезонный спрос"
              value={restaurant.verandaActive && veranda.demandLift > 1 ? `+${Math.round((veranda.demandLift - 1) * 100)}%` : '—'}
              hint="verandaSeason"
              tone={restaurant.verandaActive ? 'good' : 'neutral'}
            />
            <MetricRow
              label="Погода"
              value={veranda.weatherDaysShare > 0 ? `${Math.round(veranda.weatherDaysShare * 100)}% дней ×${veranda.weatherTrafficMult}` : '—'}
              hint="Дождливые дни: места веранды и спрос режутся"
              tone="neutral"
            />
            <MetricRow
              label="Содержание"
              value={`${money(vp.monthlyCost)}/мес в сезон`}
              hint={`Демонтаж в октябре: ${money(vp.dismantlingCost)} (разово)`}
            />
          </div>
          <div className="space-y-3">
            <div
              className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600"
              role="note"
            >
              <CloudRain className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" aria-hidden />
              <p>
                Веранда выбирается на этапе открытия ({money(vp.setupCost)}). В сезон (май–сентябрь)
                она даёт +{restaurant.verandaActive ? restaurant.verandaSeats : VERANDA.seats} мест,
                летний буст спроса и очередь без потерь — но каждые {Math.round(veranda.weatherDaysShare * 100)} дней
                сезона дождь режет посадку вдвое.
              </p>
            </div>
            {restaurant.verandaActive && (
              <div
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                role="alert"
              >
                <Users className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                <div className="w-full">
                  <p className="mb-2">
                    +{restaurant.verandaSeats} мест требуют СЕЗОННУЮ БРИГАДУ: не только официанты — прирост гостей
                    упирается в горячий цех, чек режется станциями. Бригада = {veranda.seasonalWaiters} официанта + 2 повара,
                    встают в график сразу. Сейчас официантов: {waiters}.
                  </p>
                  <Button
                    className="h-10 w-full bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => hireSeasonal(veranda.seasonalWaiters)}
                    disabled={disabled || !inSeason}
                    title="Найм 2 официантов + 2 поваров горячего цеха с графиками (подбор платный)"
                  >
                    <Users className="h-4 w-4 mr-1.5" aria-hidden />
                    Сезонная бригада — {money(BALANCE_V2_2.quit.hiringCost * (veranda.seasonalWaiters + 2))}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

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

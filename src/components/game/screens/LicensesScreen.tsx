/**
 * Экран «Лицензии» (ТЗ §31.4 п.11): алкогольная лицензия, веранда,
 * санитарная обработка.
 */
'use client';

import { useGame } from '@/lib/game/store/gameStore';
import { SectionCard, MetricRow, money } from '../widgets';
import { ALCOHOL_LICENSE, VERANDA } from '@/lib/game/config/premises.config';
import { CLEANING } from '@/lib/game/config/marketing.config';
import { dishOf } from '@/lib/game/content/resolve';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Sun, ShieldAlert, CheckCircle2, AlertTriangle, Sparkles, Info } from 'lucide-react';

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

      {/* Веранда */}
      <SectionCard title="Летняя веранда" icon={Sun}>
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {restaurant.verandaActive ? (
                <>
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Открыта
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
              value={restaurant.verandaActive ? `+${restaurant.verandaSeats}` : '—'}
            />
            <MetricRow label="Сезон" value="май — сентябрь" hint="вне сезона веранда не работает" />
            <MetricRow
              label="Атмосфера летом"
              value={restaurant.verandaActive ? 'рост привлекательности' : '—'}
              hint="Веранда поднимает проходимость в тёплые месяцы"
              tone={restaurant.verandaActive ? 'good' : 'neutral'}
            />
            <MetricRow
              label="Содержание"
              value={`${money(VERANDA.monthlyExtraCost)}/мес`}
              hint="доп. расходы в тёплый сезон"
            />
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" aria-hidden />
            <p>
              Веранда выбирается на этапе открытия ресторана (в визарде) — в текущей версии игры
              достроить её на ходу нельзя. Летом она даёт до +{VERANDA.seats} посадочных мест и
              атмосферу уличного формата.
            </p>
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

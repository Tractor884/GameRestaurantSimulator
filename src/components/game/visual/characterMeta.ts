/**
 * ============================================================================
 * МЕТАДАННЫЕ ПЕРСОНАЖЕЙ ДЛЯ ВИЗУАЛЬНЫХ КОМПОНЕНТОВ
 * ============================================================================
 * Имя/роль/иконка/цвет + соответствие ключам реестра арта.
 * CHARACTER_BIBLE §1 (костюмы и цвета) + §13 карты экранов.
 */

import type { CharacterId, Mood } from '@/lib/game/presentation/types';
import {
  Users,
  ChefHat,
  Calculator,
  Boxes,
  Wrench,
  Megaphone,
  Landmark,
  Crown,
  type LucideIcon,
} from 'lucide-react';

export interface CharacterMeta {
  id: CharacterId;
  name: string;
  role: string;
  icon: LucideIcon;
  /** Фирменный цвет персонажа (ART_STYLE §2.1, tailwind-классы). */
  colorClass: string;
  /** Ключ реестра портретов: characters/{id}/{mood}. */
  artPrefix: string;
}

export const CHARACTER_META: Record<CharacterId, CharacterMeta> = {
  hr: { id: 'hr', name: 'Анна', role: 'HR-директор', icon: Users, colorClass: 'text-emerald-700', artPrefix: 'characters/hr' },
  chef: { id: 'chef', name: 'Максим', role: 'шеф-повар', icon: ChefHat, colorClass: 'text-orange-700', artPrefix: 'characters/chef' },
  accountant: { id: 'accountant', name: 'Ирина', role: 'главный бухгалтер', icon: Calculator, colorClass: 'text-stone-600', artPrefix: 'characters/accountant' },
  warehouse_manager: { id: 'warehouse_manager', name: 'Сергей', role: 'кладовщик', icon: Boxes, colorClass: 'text-amber-800', artPrefix: 'characters/warehouse_manager' },
  technician: { id: 'technician', name: 'Николай', role: 'техник', icon: Wrench, colorClass: 'text-amber-600', artPrefix: 'characters/technician' },
  marketer: { id: 'marketer', name: 'Ольга', role: 'маркетолог', icon: Megaphone, colorClass: 'text-orange-600', artPrefix: 'characters/marketer' },
  banker: { id: 'banker', name: 'Андрей', role: 'банкир', icon: Landmark, colorClass: 'text-stone-700', artPrefix: 'characters/banker' },
  owner: { id: 'owner', name: 'Игорь', role: 'владелец', icon: Crown, colorClass: 'text-stone-500', artPrefix: 'characters/owner' },
};

/** UI-семантика настроений (ART_STYLE §2.2, тёплая палитра UI). */
export const MOOD_UI: Record<Mood, { label: string; ring: string; text: string; bg: string; dot: string; border: string }> = {
  great: {
    label: 'отлично',
    ring: 'ring-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-100',
    dot: 'bg-emerald-500',
    border: 'border-emerald-300',
  },
  normal: {
    label: 'норма',
    ring: 'ring-stone-300',
    text: 'text-stone-600',
    bg: 'bg-stone-100',
    dot: 'bg-stone-400',
    border: 'border-stone-200',
  },
  warning: {
    label: 'тревога',
    ring: 'ring-amber-400',
    text: 'text-amber-700',
    bg: 'bg-amber-100',
    dot: 'bg-amber-500',
    border: 'border-amber-300',
  },
  critical: {
    label: 'критично',
    ring: 'ring-red-400',
    text: 'text-red-700',
    bg: 'bg-red-100',
    dot: 'bg-red-500',
    border: 'border-red-300',
  },
};

/** Реплики персонажей по состояниям (VisualMessage, PRESENTATION-LAYER §4). */
export const CHARACTER_LINES: Record<CharacterId, Record<Mood, string[]>> = {
  hr: {
    great: ['Команда цветёт — усталость низкая, мораль высокая!', 'Штат укомплектован, новичков ввели в курс дела.'],
    normal: ['Графики закрыты, текучести нет.', 'Штат работает штатно, жалоб нет.'],
    warning: ['Усталость растёт — поставьте выходные в графиках.', 'Мораль просела: проверьте переработки и новичков.'],
    critical: ['Люди на пределе! Сократите смены, иначе волна увольнений.', 'Критический недокомплект — закройте смены срочно.'],
  },
  chef: {
    great: ['Кухня в пике формы: загрузка ровная, FC в цели.', 'Станции успевают, стоп-листов нет.'],
    normal: ['Кухня работает ровно, особых проблем нет.', 'Загрузка станций в норме.'],
    warning: ['Пик кухни упёрся в потолок — упростите меню на вечер.', 'FC ползёт вверх: проверьте порции и закупки.'],
    critical: ['Кухня захлёбывается! Стоп-лист сложных блюд нужен сейчас.', 'FC вне контроля — меню не по карману.'],
  },
  accountant: {
    great: ['Кассовая подушка запасная, неделя в плюсе.', 'Финансы устойчивы: резерва хватит на месяцы.'],
    normal: ['Финансы стабильны, платежи в графике.', 'Касса в норме, кредитная нагрузка посильная.'],
    warning: ['Подушка тает — следите за недельным оттоком.', 'Прибыль минусовая: расходы давят.'],
    critical: ['Касса на дни! Заморозьте закупки и маркетинг.', 'Просрочка по кредиту — банк уже звонит.'],
  },
  warehouse_manager: {
    great: ['Запас в идеальной зоне 2–4 дня, порча минимальна.', 'Полки полные, ничего не истекает.'],
    normal: ['Склад в порядке, поставки идут по графику.'],
    warning: ['Запасы на дне — срочная закупка нужна сегодня.', 'Скоро истекает крупная партия — не дайте пропасть.'],
    critical: ['Стокаут! Стоп-листы убивают продажи.', 'Порча на складе — деньги на свалку.'],
  },
  technician: {
    great: ['Оборудование как новое, рисков нет.', 'Всё смазано, всё работает.'],
    normal: ['Износ в норме, плановое обслуживание справляется.'],
    warning: ['Износ растёт — запланируйте ремонт, не ждите поломки.', 'Кофемашина потекла: нужен сервис.'],
    critical: ['Поломка на смене! Без ремонта встанет вся кухня.', 'Износ критический — ремонт обязателен.'],
  },
  marketer: {
    great: ['Трафик растёт, кампании конвертят!', 'Воронка переполнена — бронируйте мощности.'],
    normal: ['Кампании идут штатно, трафик стабильный.'],
    warning: ['Трафик падает без кампаний — включите продвижение.', 'Бюджет кампаний съедает маржу.'],
    critical: ['Скандал в соцсетях гасит спрос! Реагируйте срочно.', 'Обвал трафика —25%: нужна экстренная акция.'],
  },
  banker: {
    great: ['Долгов нет — отличная позиция.', 'Кредитная история безупречна, лимиты выросли.'],
    normal: ['Платежи в графике, банк спокоен.'],
    warning: ['Долговая нагрузка растёт на фоне тонкой подушки.'],
    critical: ['Просрочка! Дальше — пени и требование досрочного возврата.', 'Касса не покроет платёж — звоните, реструктурируем.'],
  },
  owner: {
    great: ['Цели года опережаем, BSC отличный!', 'Год идёт лучше плана — так держать.'],
    normal: ['Идём по графику целей.', 'Показатели в коридоре плана.'],
    warning: ['Отстаём от целей — подтяните финансы и рейтинг.', '1–2 цели под угрозой, время исправлять.'],
    critical: ['Провал близко: цели года под угрозой.', 'Такими темпами год закончится плохо.'],
  },
};

/** Детерминированный выбор реплики (PRESENTATION-LAYER §4):
 *  хэш от недели/дня — БЕЗ RNG (скриншот-стабильность). */
export function pickLine(
  lines: string[],
  week: number,
  day: number,
  salt: number,
): string {
  const h = (week * 31 + day * 7 + salt * 13) % lines.length;
  return lines[h];
}

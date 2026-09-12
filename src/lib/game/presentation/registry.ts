/**
 * ============================================================================
 * РЕЕСТР СЛОТОВ АРТА (ASSET_LIST.md §10)
 * ============================================================================
 * Имя слота = ключ (в IndexedDB пользовательских загрузок). Расширение
 * builtin — только .webp из public/game-art (ассеты P0a).
 *
 * ПРАВИЛА РЕЕСТРА:
 *  1. Ключ нельзя переименовывать после включения в код (только депрекация).
 *  2. Пользовательская загрузка (IndexedDB) всегда ПРИОРИТЕТНЕЕ builtin.
 *  3. Нет файла → нейтральный плейсхолдер, экран обязан работать без арта
 *     (ART_STYLE §10 — fallback-стандарт).
 */

import type { CharacterId, GuestSpriteId, Mood } from './types';

export type ArtGroupId = 'characters' | 'staff' | 'guests' | 'scenes' | 'layers_hall' | 'layers_warehouse' | 'objects';

export type ArtSlotKind = 'portrait' | 'fullbody' | 'guest' | 'scene' | 'layer' | 'object';

export interface ArtSlot {
  /** Уникальный ключ = ключ записи в хранилище пользовательских картинок. */
  key: string;
  group: ArtGroupId;
  /** Человеческая подпись в менеджере арта. */
  label: string;
  kind: ArtSlotKind;
  /** Путь встроенного webp (null = встроенного нет, ждём свою загрузку). */
  builtin: string | null;
  /** Рекомендуемый размер генерации/загрузки. */
  width: number;
  height: number;
  /** Что изображать — подсказка для художника/подбора картинки. */
  hint: string;
}

export const MOODS: Mood[] = ['great', 'normal', 'warning', 'critical'];
export const MOOD_RU: Record<Mood, string> = {
  great: 'отлично',
  normal: 'норма',
  warning: 'тревога',
  critical: 'критично',
};

export const GUEST_MOODS = ['happy', 'neutral', 'unhappy'] as const;
export const GUEST_MOOD_RU: Record<string, string> = {
  happy: 'довольны',
  neutral: 'нейтральны',
  unhappy: 'недовольны',
};

/* ── Именные персонажи (CHARACTER_BIBLE §1) ── */

interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  folder: string;
  prefix: string;
  builtin: boolean;
  look: string;
  moods: Record<Mood, string>;
}

const CHARACTERS: CharacterDef[] = [
  {
    id: 'hr',
    name: 'Анна',
    role: 'HR-директор',
    folder: 'characters/hr',
    prefix: 'hr',
    builtin: true,
    look: '38 лет, тёмно-русые волосы в пучок, джемпер шалфей + белая рубашка',
    moods: {
      great: 'довольна: улыбка, блеск, палец вверх',
      normal: 'спокойна: рабочая улыбка, блокнот',
      warning: 'обеспокоена: рука к щеке, брови домиком',
      critical: 'серьёзная: сжатые губы, стоп-жест рукой',
    },
  },
  {
    id: 'chef',
    name: 'Максим',
    role: 'шеф-повар',
    folder: 'characters/chef',
    prefix: 'chef',
    builtin: false,
    look: '45 лет, борода с проседью, белый китель + терракотовый фартук, полотенце на плече',
    moods: {
      great: 'горд: подбородок вверх, половник как скипетр',
      normal: 'работает: взгляд в рецепт',
      warning: 'недоволен: скрещенные руки, брови сведены',
      critical: 'раздражён: красные штрихи, машет полотенцем',
    },
  },
  {
    id: 'accountant',
    name: 'Ирина',
    role: 'главный бухгалтер',
    folder: 'characters/accountant',
    prefix: 'accountant',
    builtin: true,
    look: '50 лет, каре с проседью, очки на кончике носа, оливково-серый жакет',
    moods: {
      great: 'спокойна: улыбка, лист с растущим графиком',
      normal: 'нейтральна: калькулятор в руке',
      warning: 'тревожится: очки на нос, палец к строке',
      critical: 'кризис: обе руки к голове',
    },
  },
  {
    id: 'warehouse_manager',
    name: 'Сергей',
    role: 'кладовщик',
    folder: 'characters/warehouse_manager',
    prefix: 'warehouse_manager',
    builtin: true,
    look: '52 года, пышные усы, крупный, жилет орех + рубашка',
    moods: {
      great: 'порядок: довольная улыбка, жест на полки',
      normal: 'работа: ведёт накладную',
      warning: 'дефицит: смотрит в пустой ящик',
      critical: 'хаос: руки в стороны у пустых стеллажей',
    },
  },
  {
    id: 'technician',
    name: 'Николай',
    role: 'техник',
    folder: 'characters/technician',
    prefix: 'technician',
    builtin: true,
    look: '40 лет, кепка, щетина, шарф, комбинезон графит + янтарная жилетка',
    moods: {
      great: 'одобряет: thumbs-up у блестящей машины',
      normal: 'чинит: гаечный ключ в руке',
      warning: 'на колене у машины, капля пота',
      critical: 'разглядывает дым/искры',
    },
  },
  {
    id: 'marketer',
    name: 'Ольга',
    role: 'маркетолог',
    folder: 'characters/marketer',
    prefix: 'marketer',
    builtin: false,
    look: '29 лет, тёмные кудри, терракотовый пиджак + кремовая водолазка, планшет',
    moods: {
      great: 'в потоке: планшет вверх, энергия',
      normal: 'рутина: взгляд в планшет',
      warning: 'перерасход: закусила губу',
      critical: 'скандал: рука к щеке, красные штрихи',
    },
  },
  {
    id: 'banker',
    name: 'Андрей',
    role: 'банкир',
    folder: 'characters/banker',
    prefix: 'banker',
    builtin: false,
    look: '47 лет, зачёс назад, седые виски, костюм графит + галстук бордо',
    moods: {
      great: 'доволен: вежливая улыбка',
      normal: 'нейтрален: руки сложены',
      warning: 'наблюдает: правит галстук',
      critical: 'звонит вам: телефон у уха',
    },
  },
  {
    id: 'owner',
    name: 'Игорь',
    role: 'владелец',
    folder: 'characters/owner',
    prefix: 'owner',
    builtin: false,
    look: '55 лет, седой ежик, свитер крем поверх рубашки, кофе в руке',
    moods: {
      great: 'опережаем: кофе поднят тостом',
      normal: 'в графике: спокойная улыбка',
      warning: 'отстаём: брови сведены',
      critical: 'разочарован: ладонь ко лбу',
    },
  },
];

/* ── Персонал смены (CHARACTER_BIBLE §2) ── */

interface StaffDef {
  id: 'waiter' | 'cook' | 'barista' | 'hostess';
  role: string;
  look: string;
}

const STAFF: StaffDef[] = [
  { id: 'waiter', role: 'Официант', look: '26 лет, хвостик, чёрный фартук + крем рубашка' },
  { id: 'cook', role: 'Повар линии', look: '33 года, бандана, белый китель + орех фартук' },
  { id: 'barista', role: 'Бариста', look: '24 года, веснушки, шалфей фартук + крем футболка' },
  { id: 'hostess', role: 'Хостес', look: '27 лет, коса, терракотовое платье' },
];

/* ── Гости (CHARACTER_BIBLE §3) ── */

interface GuestDef {
  id: GuestSpriteId;
  role: string;
  segments: string;
  look: string;
}

const GUESTS: GuestDef[] = [
  { id: 'business', role: 'Бизнес-гость', segments: 'business_lunch, office_evening', look: 'мужчина 38, портфель, костюм графит' },
  { id: 'family', role: 'Семья', segments: 'family, breakfast', look: 'пара + ребёнок с плюшевым медведем' },
  { id: 'couple_evening', role: 'Пара на ужине', segments: 'evening', look: 'пара 30 на свидании, свеча' },
  { id: 'tourist', role: 'Туристы', segments: 'tourist', look: 'пара 45+ с картой и рюкзаком' },
  { id: 'youth', role: 'Молодёжь', segments: 'youth', look: 'двое друзей 20, телефон и смузи' },
  { id: 'premium', role: 'Премиум-пара', segments: 'premium', look: 'женщина 40 в шарфе, мужчина в бордовом пиджаке' },
];

/* ── Сборка реестра ── */

function buildSlots(): ArtSlot[] {
  const slots: ArtSlot[] = [];

  // Портреты персонажей: 8 × 4 состояний.
  for (const c of CHARACTERS) {
    for (const mood of MOODS) {
      slots.push({
        key: `${c.folder}/${mood}`,
        group: 'characters',
        label: `${c.name} (${c.role}) · ${MOOD_RU[mood]}`,
        kind: 'portrait',
        builtin: c.builtin ? `/game-art/${c.folder}/${c.prefix}_${mood}.webp` : null,
        width: 1024,
        height: 1024,
        hint: `${c.look}. ${c.moods[mood]}. Портрет по грудь, 3/4, фон #07392F.`,
      });
    }
  }
  // Fallback-силуэт.
  slots.push({
    key: 'characters/_fallback/character_normal',
    group: 'characters',
    label: 'Резервный силуэт (fallback)',
    kind: 'portrait',
    builtin: null,
    width: 1024,
    height: 1024,
    hint: 'Нейтральный силуэт сотрудника без лица в кремовом круге. Используется, когда других картинок нет.',
  });

  // Персонал смены: 4 × 4.
  for (const s of STAFF) {
    for (const mood of MOODS) {
      slots.push({
        key: `staff/${s.id}/${mood}`,
        group: 'staff',
        label: `${s.role} · ${MOOD_RU[mood]}`,
        kind: 'fullbody',
        builtin: null,
        width: 1024,
        height: 1024,
        hint: `${s.look}. ${MOOD_RU[mood]}: мимика по канону. В рост, стопы в кадре, прозрачный фон.`,
      });
    }
  }

  // Гости: 6 × 3.
  for (const g of GUESTS) {
    for (const mood of GUEST_MOODS) {
      slots.push({
        key: `guests/${g.id}/${mood}`,
        group: 'guests',
        label: `${g.role} · ${GUEST_MOOD_RU[mood]}`,
        kind: 'guest',
        builtin: null,
        width: 1024,
        height: 1024,
        hint: `${g.look}. ${GUEST_MOOD_RU[mood]}. Мини-группа 1–3 фигур, прозрачный фон.`,
      });
    }
  }

  // Сцены.
  slots.push(
    {
      key: 'scenes/restaurant/restaurant_base',
      group: 'scenes',
      label: 'Зал ресторана (база)',
      kind: 'scene',
      builtin: '/game-art/scenes/restaurant/restaurant_base.webp',
      width: 1344,
      height: 768,
      hint: 'Зал по ANCHOR-GRID: пасс слева-сверху, кофестанция справа, 6 столов в центре, вход справа-снизу, окна слева. Без людей. Палитра «Изумрудный бистро».',
    },
    {
      key: 'scenes/warehouse/warehouse_base',
      group: 'scenes',
      label: 'Склад (база)',
      kind: 'scene',
      builtin: null,
      width: 1344,
      height: 768,
      hint: 'Стеллажи, морозилка (холодный серо-голубой акцент), стол приёмки. Без людей.',
    },
    {
      key: 'scenes/kitchen/kitchen_base',
      group: 'scenes',
      label: 'Кухня (база)',
      kind: 'scene',
      builtin: null,
      width: 1344,
      height: 768,
      hint: 'Кухня крупно: плиты, пасс, разделочные столы. Без людей.',
    },
    {
      key: 'scenes/office/office_base',
      group: 'scenes',
      label: 'Кабинет (база)',
      kind: 'scene',
      builtin: null,
      width: 1344,
      height: 768,
      hint: 'Кабинет руководителя: стол, кресло, доска целей. Для квартального разбора.',
    },
  );

  // Слои зала (ASSET_LIST §5).
  const HALL_LAYERS: { id: string; label: string; hint: string }[] = [
    { id: 'queue_small', label: 'Очередь: 2–3 гостя', hint: '2–3 человека у входа, спокойные лица. Прозрачный фон.' },
    { id: 'queue_medium', label: 'Очередь: 4–6 гостей', hint: '4–6 человек, кто-то смотрит на часы. Прозрачный фон.' },
    { id: 'queue_large', label: 'Очередь: 7+ гостей', hint: '8+ человек, недовольные лица, руки скрещены. Прозрачный фон.' },
    { id: 'floor_dirty', label: 'Грязный пол', hint: 'Разводы/крошки на деревянном полу, широкий формат. Прозрачный фон.' },
    { id: 'dirty_dishes', label: 'Гора посуды', hint: 'Стопка тарелок у пасса. Прозрачный фон.' },
    { id: 'coffee_warning', label: 'Кофемашина: протечка', hint: 'Кофемашина, лужица и капли. Прозрачный фон.' },
    { id: 'coffee_broken', label: 'Кофемашина: поломка', hint: 'Кофемашина, дым, тёмный крестик на дисплее. Прозрачный фон.' },
    { id: 'kitchen_steam', label: 'Пар над пассом', hint: 'Лёгкие полупрозрачные клубы пара. Прозрачный фон.' },
    { id: 'kitchen_smoke', label: 'Дым над кухней', hint: 'Густой дым + искры. Прозрачный фон.' },
    { id: 'penalty_notice', label: 'Предписание на двери', hint: 'Белый лист с печатью на входной двери, БЕЗ текста. Прозрачный фон.' },
    { id: 'evening_glow', label: 'Вечерняя виньетка', hint: 'Янтарный полупрозрачный градиент по краям кадра. Прозрачный фон.' },
  ];
  for (const l of HALL_LAYERS) {
    slots.push({
      key: `objects/${l.id}`,
      group: 'layers_hall',
      label: l.label,
      kind: 'layer',
      builtin: null,
      width: 1024,
      height: 1024,
      hint: l.hint,
    });
  }

  // Слои склада (ASSET_LIST §6).
  const WAREHOUSE_LAYERS: { id: string; label: string; hint: string }[] = [
    { id: 'shelves_full', label: 'Полки: полные', hint: 'Стеллаж, полностью заставленный ящиками. Прозрачный фон.' },
    { id: 'shelves_low', label: 'Полки: полупустые', hint: 'Стеллаж с несколькими ящиками. Прозрачный фон.' },
    { id: 'shelves_empty', label: 'Полки: пустые', hint: 'Пустой стеллаж, паутина в углу. Прозрачный фон.' },
    { id: 'spoiled_food', label: 'Испорченные продукты', hint: 'Ящик с зелёной гнилью, мухи. Прозрачный фон.' },
    { id: 'near_expiry', label: 'Скоро истечение', hint: 'Коробка со стикером-восклицательным знаком (без букв). Прозрачный фон.' },
  ];
  for (const l of WAREHOUSE_LAYERS) {
    slots.push({
      key: `objects/${l.id}`,
      group: 'layers_warehouse',
      label: l.label,
      kind: 'layer',
      builtin: null,
      width: 1024,
      height: 1024,
      hint: l.hint,
    });
  }

  // Объекты-иконки событий (ASSET_LIST §7).
  const OBJECTS: { id: string; label: string; hint: string }[] = [
    { id: 'broken_coffee_machine', label: 'Сломанная кофемашина (иконка)', hint: 'Крупно для экрана Оборудование. Прозрачный фон.' },
    { id: 'inspection', label: 'Проверка (иконка)', hint: 'Событие-проверка. Прозрачный фон.' },
    { id: 'blogger_scandal', label: 'Инфо-скандал (иконка)', hint: 'Событие-скандал в соцсетях. Прозрачный фон.' },
    { id: 'celebration', label: 'Праздник (иконка)', hint: 'Позитивное событие/юбилей. Прозрачный фон.' },
    { id: 'cash_register', label: 'Касса (виджет)', hint: 'Виджет кассы для экрана Финансы. Прозрачный фон.' },
  ];
  for (const o of OBJECTS) {
    slots.push({
      key: `objects/${o.id}`,
      group: 'objects',
      label: o.label,
      kind: 'object',
      builtin: null,
      width: 1024,
      height: 1024,
      hint: o.hint,
    });
  }

  return slots;
}

export const ART_SLOTS: ArtSlot[] = buildSlots();

export const ART_SLOT_MAP: Record<string, ArtSlot> = Object.fromEntries(ART_SLOTS.map((s) => [s.key, s]));

export const ART_GROUPS: { id: ArtGroupId; label: string; description: string }[] = [
  { id: 'characters', label: 'Персонажи (портреты)', description: 'Именные консультанты: 8 героев × 4 состояния. Квадрат 1024×1024, фон тёмно-изумрудный #07392F.' },
  { id: 'staff', label: 'Персонал смены', description: 'Обобщённые сотрудники в рост: 4 роли × 4 состояния. 1024×1024, прозрачный фон.' },
  { id: 'guests', label: 'Гости', description: 'Мини-группы гостей: 6 типов × 3 настроения. 1024×1024, прозрачный фон.' },
  { id: 'scenes', label: 'Сцены (базы)', description: 'Фоновые изображения локаций. 1344×768.' },
  { id: 'layers_hall', label: 'Слои зала', description: 'Накладки на сцену зала: очередь, грязь, дым… 1024×1024, прозрачный фон.' },
  { id: 'layers_warehouse', label: 'Слои склада', description: 'Накладки на сцену склада: полки, порча. 1024×1024, прозрачный фон.' },
  { id: 'objects', label: 'Иконки событий', description: 'Крупные объекты-символы для экранов. 1024×1024, прозрачный фон.' },
];

/** Слоты группы (для менеджера арта). */
export function artSlotsOfGroup(group: ArtGroupId): ArtSlot[] {
  return ART_SLOTS.filter((s) => s.group === group);
}

/** Встроенный путь слота (null, если встроенного арта нет). */
export function getBuiltinPath(key: string): string | null {
  return ART_SLOT_MAP[key]?.builtin ?? null;
}

/** Подсказка слота. */
export function artHintOf(key: string): string {
  return ART_SLOT_MAP[key]?.hint ?? '';
}

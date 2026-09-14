/**
 * ============================================================================
 * ПРЕЗЕНТАЦИОННЫЙ СЛОЙ — публичный API (PRESENTATION-LAYER.md §1)
 * ============================================================================
 * Тонкий слой «только-чтение» между GameState и UI. Движок ничего не знает
 * о картинках; картинки ничего не решают в экономике.
 */

export type {
  Mood,
  GuestMood,
  QueueLevel,
  LayerOn,
  CoffeeDisplay,
  StockDisplay,
  CharacterId,
  GuestSpriteId,
  NoticeKind,
  ArtSource,
  SceneVisualState,
  WarehouseVisual,
  FinanceVisual,
  EquipmentVisual,
  CharacterVisual,
  StaffSceneMood,
} from './types';

export { THRESHOLDS, worstMood, moodFromFlags } from './thresholds';

export {
  ART_SLOTS,
  ART_SLOT_MAP,
  ART_GROUPS,
  MOODS,
  MOOD_RU,
  GUEST_MOOD_RU,
  artSlotsOfGroup,
  getBuiltinPath,
  artHintOf,
} from './registry';
export type { ArtSlot, ArtGroupId, ArtSlotKind } from './registry';

export {
  getCharacterMood,
  getHrMood,
  getStaffRoleMood,
  getChefMood,
  getMarketerMood,
  getOwnerMood,
  isUnderstaffed,
  isSeverelyUnderstaffed,
  peakKitchenLoad,
  currentFoodCost,
  guestTrend,
} from './characters';

export {
  getAccountantMood,
  getBankerMood,
  getFinanceVisualState,
  runwayWeeks,
  avgWeeklyOut,
  anyOverdue,
} from './finance';

export { getWarehouseVisualState, getWarehouseMood } from './warehouse';
export { buildKpis, buildDebrief } from './academy';
export type { KpiCardData, KpiStatus, DebriefIssue } from './academy';
export {
  getTechnicianMood,
  getEquipmentVisualState,
  getCoffeeDisplay,
  equipmentBrokenNow,
} from './equipment';
export {
  getRestaurantVisualState,
  getGuestMoodOfDay,
} from './scene';
export {
  marketerBrief,
  bankerBrief,
  ownerBrief,
  coreSegmentOf,
  dividendsPaidTotal,
} from './advisors';
export type {
  MarketerBrief,
  BankerBrief,
  OwnerBrief,
  OwnerGoal,
  AdvisorCampaign,
} from './advisors';

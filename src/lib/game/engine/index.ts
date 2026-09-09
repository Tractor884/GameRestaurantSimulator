/**
 * Публичный API движка. UI работает только через этот модуль.
 */
export { simulateDay, startDayRun, runHoursUntil, finishDay } from './day';
export type { DayRunContext, DayTotals } from './day';
export { simulateWeek } from './week';
export { simulateDayUntilPause, resumeDay, applyEmergencyAction } from './emergency';
export { dishOf, allDishes, dishMapOf, restaurantDish } from '../content/resolve';
export {
  createGame,
  defaultSchedule,
  defaultPools,
  toggleMenuDish,
  setDishPrice,
  toggleStopList,
  importCustomDishes,
  purchaseIngredients,
  hireStaff,
  fireStaff,
  setScheduleShifts,
  startCampaign,
  stopCampaign,
  setCleaningBudget,
  buyEquipment,
  repairEquipment,
  deepCleaning,
  buyAlcoholLicense,
  repayLoan,
  resolveEvent,
  autoOrderAction,
  setAutoPurchase,
  setProcurementPolicy,
  replyToReviews,
  hireSeasonalStaff,
} from './setup';
export type { SetupOptions, ActionResult } from './setup';
export {
  availableQuantity,
  maxPortions,
  buildAutoOrder,
  estimateIngredientNeeds,
} from './inventory';
export { computeForecast } from './forecast';
export { computeBSCFromState } from './bsc';
export { checkInvariants } from './invariants';
export { fmtMoney, fmtNum, fmtPct, workingHours, dayIndex, DAYS_RU } from './core';
export { avgCategoryPrices, estimatedCheck, marketingFactor, potentialDailyDemand } from './demand';
export { stationCapacity, effectiveStaff, staffOnDuty, hourlyRate, dayCoverage, averageFatigue } from './staff';
export { turnoverRateFromState } from './bsc';
// Этап 6 «Представление» (BALANCING-V2 §20): финальный ранг и спец-финалы.
export {
  computeFinalGrade,
  axisHints,
  RANK_PRESENTATION,
  STARS_FINAL,
  RELOCATION_FINAL,
  BANKRUPT_REASONS,
  GRADE_AXIS_WEIGHTS,
} from './finalGrade';
export type { FinalRankId, FinalGrade, FinalGradeSpecial, RankPresentation, SpecialPresentation } from './finalGrade';
export { menuFatigueFactor } from './endday';
export type { ProcurementPolicyId } from '../types';
export { recipeCost, recipeFoodCost } from '../content/dishes';
export { DISHES, DISHES_MAP, STARTER_MENU_IDS } from '../content/dishes';
export { INGREDIENTS, INGREDIENTS_MAP, INGREDIENT_CATEGORIES } from '../content/ingredients';
export { createOwnerDividendEvent, createOwnerTalkEvent, applyDividendDecision, applyOwnerForcePay, applyOwnerRefuse, ownerReplaced } from './dividends';

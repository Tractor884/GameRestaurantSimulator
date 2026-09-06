/**
 * Публичный API движка. UI работает только через этот модуль.
 */
export { simulateDay } from './day';
export { simulateWeek } from './week';
export {
  createGame,
  defaultSchedule,
  defaultPools,
  toggleMenuDish,
  setDishPrice,
  toggleStopList,
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
export { recipeCost, recipeFoodCost } from '../content/dishes';
export { DISHES, DISHES_MAP, STARTER_MENU_IDS } from '../content/dishes';
export { INGREDIENTS, INGREDIENTS_MAP, INGREDIENT_CATEGORIES } from '../content/ingredients';

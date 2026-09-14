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
  staffHiringCost,
  fireStaff,
  setScheduleShifts,
  startCampaign,
  stopCampaign,
  setCleaningBudget,
  buyEquipment,
  repairEquipment,
  serviceEquipment,
  deepCleaning,
  haccpAudit,
  buyAlcoholLicense,
  buyVerandaPermit,
  dismantleVeranda,
  verandaSeasonMonths,
  repayLoan,
  resolveEvent,
  applyEventResolution,
  autoResolveOverdueEvents,
  setAutoPurchase,
  setProcurementPolicy,
  replyToReviews,
} from './setup';
export type { SetupOptions, ActionResult } from './setup';
export {
  payBonus,
  trainRole,
  setInsurance,
  bonusCost,
  trainingCost,
  insuranceWeeklyCost,
  weeklyPayrollEstimate,
  absoluteDay,
  BONUS_COOLDOWN_DAYS,
  TRAINING_COOLDOWN_DAYS,
  INSURANCE_PAYROLL_SHARE,
} from './welfare';
export {
  availableQuantity,
  maxPortions,
  buildAutoOrder,
  estimateIngredientNeeds,
} from './inventory';
export { PROCUREMENT, PROC_LABELS, activeProcurement, procAutoCoverDays } from '../config/procurement.config';
export { REVIEWS_V2, reviewNeedsReply, unansweredConvFactor } from '../config/reviews.config';
export type { ProcurementPolicyId } from '../types';
export { LANDLORD, rentQuarterlyIndex } from '../config/landlord.config';
export { DIVIDENDS, dividendProposal, dividendTrustDelta } from '../config/dividends.config';
export { DILEMMAS, DILEMMA_LABELS } from '../config/dilemmas.config';
export {
  EQUIPMENT_SERVICE,
  serviceStatus,
  wearMult as serviceWearMult,
  breakMult as serviceBreakMult,
  type ServiceStatus,
} from '../config/equipmentService.config';
export { HACCP, haccpStatus, type HaccpStatus } from '../config/haccp.config';
export { INFLATION, OVERTIME, FOOD_STEP, WAGE_STEP, UTIL_STEP } from '../config/inflation.config';
export { currentRentMonthly, rentIndexationInfo } from './landlord';
export {
  dishAge,
  dishFreshnessFactor,
  menuFreshnessFactor,
  freshnessBadge,
  noteDishAdded,
  noteDishRemoved,
} from './menufatigue';
export {
  computeFinalGrade,
  scoreLevel,
  scoreBandRange,
  RANK_PRESENTATION,
  STARS_FINAL,
  OWNER_REPLACED_FINAL,
  RELOCATION_FINAL,
  BANKRUPT_REASONS,
  axisHints,
  GRADE_AXIS_WEIGHTS,
} from './finalGrade';
export type { FinalGrade, FinalRankId, RankPresentation, SpecialPresentation } from './finalGrade';
export { computeForecast } from './forecast';
export { computeBSCFromState } from './bsc';
export { checkInvariants } from './invariants';
export { fmtMoney, fmtNum, fmtPct, workingHours, dayIndex, DAYS_RU } from './core';
export { avgCategoryPrices, estimatedCheck, marketingFactor, potentialDailyDemand } from './demand';
export { stationCapacity, effectiveStaff, staffOnDuty, hourlyRate, dayCoverage, averageFatigue } from './staff';
export {
  noteHired,
  noteFired,
  noteQuit,
  noteTurnoverSnapshot,
  quarterTurnoverPct,
} from './staff';
export { MONTHS_RU, MONTHS_RU_GEN, MONTHS_RU_PREP } from '../config/demandProfiles.config';
export { recipeCost, recipeFoodCost } from '../content/dishes';
export { DISHES, DISHES_MAP, STARTER_MENU_IDS } from '../content/dishes';
export { INGREDIENTS, INGREDIENTS_MAP, INGREDIENT_CATEGORIES } from '../content/ingredients';

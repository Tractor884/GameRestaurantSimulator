/**
 * Конфиг удовлетворённости гостей (ТЗ §15).
 * Satisfaction = 25% FoodQuality + 20% ServiceSpeed + 15% ServiceQuality
 *              + 15% Cleanliness + 10% PriceFairness + 10% Atmosphere + 5% Availability
 */
export const SATISFACTION = {
  weights: {
    foodQuality: 0.25,
    serviceSpeed: 0.2,
    serviceQuality: 0.15,
    cleanliness: 0.15,
    priceFairness: 0.1,
    atmosphere: 0.1,
    availability: 0.05,
  },
  /** FoodQuality (ТЗ §15.2). */
  foodQualityWeights: {
    recipeBase: 0.3,
    ingredientFreshness: 0.25,
    stationExecution: 0.2,
    equipmentQuality: 0.1,
    staffFatiguePenalty: 0.1,
    errorPenalty: 0.05,
  },
  /** Штраф за ожидание: -N очков за минуту сверх ожидаемого (ТЗ §15.3). */
  waitPenaltyPerMinute: 3,
  expectedWaitMinutes: 12,
  /** Availability (ТЗ §15.8). */
  lostItemPenalty: 25,
  stopListPenalty: 30,
};

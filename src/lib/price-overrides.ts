import type { Dish } from "./dishes";

export type PriceOverrides = Record<string, number>;

export const PRICE_OVERRIDES_KEY = "mv_price_overrides_v1";

export function loadOverrides(): PriceOverrides {
  try {
    return JSON.parse(localStorage.getItem(PRICE_OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveOverrides(overrides: PriceOverrides) {
  localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
}

export function getEffectivePrice(dish: Dish, overrides: PriceOverrides = loadOverrides()) {
  return overrides[dish.id] != null ? Number(overrides[dish.id]) : Number(dish.price);
}

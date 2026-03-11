import { resolveLocalAssetPath } from "./localAssets";

export type Dish = {
  id: string;
  cat: string;
  name: string;
  price: number;
  desc: string;
  model: string;
  thumb: string;
};

export const CUSTOM_PRODUCTS_KEY = "mv_custom_products_v1";

function isDish(value: unknown): value is Dish {
  if (!value || typeof value !== "object") return false;
  const dish = value as Record<string, unknown>;
  return (
    typeof dish.id === "string" &&
    typeof dish.cat === "string" &&
    typeof dish.name === "string" &&
    typeof dish.price === "number" &&
    Number.isFinite(dish.price) &&
    typeof dish.desc === "string" &&
    typeof dish.model === "string" &&
    typeof dish.thumb === "string"
  );
}

export function loadCustomProducts(): Dish[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_PRODUCTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDish);
  } catch {
    return [];
  }
}

export function saveCustomProducts(products: Dish[]) {
  localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(products));
}

export async function loadMenuCatalog(): Promise<Dish[]> {
  const response = await fetch("/data/dishes.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load dishes.json (${response.status})`);
  const base = (await response.json()) as unknown;
  if (!Array.isArray(base)) throw new Error("dishes.json must be an array");

  const baseDishes = base.filter(isDish);
  const custom = loadCustomProducts();

  const byId = new Map<string, Dish>();
  for (const dish of baseDishes) byId.set(dish.id, dish);
  for (const dish of custom) byId.set(dish.id, dish);

  const merged = [...byId.values()];
  return Promise.all(
    merged.map(async (dish) => ({
      ...dish,
      model: await resolveLocalAssetPath(dish.model),
      thumb: await resolveLocalAssetPath(dish.thumb),
    }))
  );
}

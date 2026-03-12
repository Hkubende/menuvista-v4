import type { Dish } from "./dishes";

export type Cart = Record<string, number>;

export const CART_KEY = "mv_cart_v1";

function sanitizeCart(input: unknown): Cart {
  if (!input || typeof input !== "object") return {};
  const next: Cart = {};
  for (const [dishId, qty] of Object.entries(input as Record<string, unknown>)) {
    if (typeof dishId !== "string" || !dishId.trim()) continue;
    const parsedQty = Number(qty);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) continue;
    next[dishId] = Math.floor(parsedQty);
  }
  return next;
}

export function loadCart(): Cart {
  try {
    return sanitizeCart(JSON.parse(localStorage.getItem(CART_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function saveCart(cart: Cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(sanitizeCart(cart)));
}

export function addToCart(cart: Cart, dishId: string, quantity = 1): Cart {
  const safeCart = sanitizeCart(cart);
  const parsedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  return {
    ...safeCart,
    [dishId]: (safeCart[dishId] || 0) + parsedQuantity,
  };
}

export function removeFromCart(cart: Cart, dishId: string, quantity = 1): Cart {
  const safeCart = sanitizeCart(cart);
  const parsedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const nextQty = (safeCart[dishId] || 0) - parsedQuantity;
  const copy = { ...safeCart };
  if (nextQty <= 0) delete copy[dishId];
  else copy[dishId] = nextQty;
  return copy;
}

export function cartCount(cart: Cart) {
  return Object.values(sanitizeCart(cart)).reduce((sum, qty) => sum + qty, 0);
}

export function cartTotal(
  cart: Cart,
  dishes: Dish[],
  priceResolver: (dish: Dish) => number = (dish) => dish.price
) {
  let total = 0;
  for (const [id, qty] of Object.entries(sanitizeCart(cart))) {
    const dish = dishes.find((item) => item.id === id);
    if (!dish) continue;
    total += priceResolver(dish) * qty;
  }
  return total;
}

export function encodeCartPayload(cart: Cart) {
  return encodeURIComponent(btoa(JSON.stringify(sanitizeCart(cart))));
}

export function decodeCartPayload(encoded: string | null): Cart {
  if (!encoded) return {};
  try {
    return sanitizeCart(JSON.parse(atob(decodeURIComponent(encoded))));
  } catch {
    return {};
  }
}

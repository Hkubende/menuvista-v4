import type { Dish } from "./dishes";

export type Cart = Record<string, number>;

export const CART_KEY = "mv_cart_v1";

export function loadCart(): Cart {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCart(cart: Cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function addToCart(cart: Cart, dishId: string, quantity = 1): Cart {
  return {
    ...cart,
    [dishId]: (cart[dishId] || 0) + quantity,
  };
}

export function removeFromCart(cart: Cart, dishId: string, quantity = 1): Cart {
  const nextQty = (cart[dishId] || 0) - quantity;
  const copy = { ...cart };
  if (nextQty <= 0) delete copy[dishId];
  else copy[dishId] = nextQty;
  return copy;
}

export function cartCount(cart: Cart) {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

export function cartTotal(
  cart: Cart,
  dishes: Dish[],
  priceResolver: (dish: Dish) => number = (dish) => dish.price
) {
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const dish = dishes.find((item) => item.id === id);
    if (!dish) continue;
    total += priceResolver(dish) * qty;
  }
  return total;
}

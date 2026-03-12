import type { Cart } from "./cart";
import type { Dish } from "./dishes";

export type OrderStatus = "pending" | "confirmed" | "preparing" | "completed";

export type OrderPaymentMethod = "manual_mpesa" | "stk_push_placeholder";

export type OrderItem = {
  dishId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type Order = {
  id: string;
  createdAt: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod;
  paymentReference: string;
};

export const ORDERS_KEY = "mv_orders_v1";

function sanitizeOrderStatus(value: unknown): OrderStatus {
  return value === "confirmed" || value === "preparing" || value === "completed"
    ? value
    : "pending";
}

function sanitizeOrder(input: unknown): Order | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.createdAt !== "string" || !row.createdAt.trim()) return null;
  if (!Array.isArray(row.items)) return null;

  const items: OrderItem[] = [];
  for (const item of row.items) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const dishId = typeof i.dishId === "string" ? i.dishId : "";
    const name = typeof i.name === "string" ? i.name : "";
    const quantity = Number(i.quantity);
    const unitPrice = Number(i.unitPrice);
    const subtotal = Number(i.subtotal);
    if (!dishId || !name) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
    if (!Number.isFinite(subtotal) || subtotal < 0) continue;
    items.push({
      dishId,
      name,
      quantity: Math.floor(quantity),
      unitPrice,
      subtotal,
    });
  }

  const total = Number(row.total);
  if (!items.length || !Number.isFinite(total) || total < 0) return null;

  return {
    id: row.id,
    createdAt: row.createdAt,
    items,
    total,
    status: sanitizeOrderStatus(row.status),
    paymentMethod: row.paymentMethod === "stk_push_placeholder" ? "stk_push_placeholder" : "manual_mpesa",
    paymentReference: typeof row.paymentReference === "string" ? row.paymentReference : "",
  };
}

function makeOrderId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MV4-${stamp}-${rand}`;
}

export function loadOrders(): Order[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeOrder).filter(Boolean) as Order[];
  } catch {
    return [];
  }
}

export function saveOrders(orders: Order[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function addOrder(order: Order) {
  const current = loadOrders();
  saveOrders([order, ...current]);
}

export function createPaymentReference() {
  return `PAY-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function getPaymentMethodLabel(method: OrderPaymentMethod) {
  return method === "manual_mpesa" ? "Manual M-Pesa" : "STK Push (Placeholder)";
}

export function buildOrderItemsFromCart(
  cart: Cart,
  dishes: Dish[],
  priceResolver: (dish: Dish) => number
) {
  const items: OrderItem[] = [];
  for (const [dishId, quantity] of Object.entries(cart)) {
    const dish = dishes.find((row) => row.id === dishId);
    if (!dish) continue;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unitPrice = Number(priceResolver(dish));
    const subtotal = unitPrice * qty;
    items.push({
      dishId: dish.id,
      name: dish.name,
      quantity: Math.floor(qty),
      unitPrice,
      subtotal,
    });
  }
  return items;
}

export function getOrderTotal(items: OrderItem[]) {
  return items.reduce((sum, row) => sum + row.subtotal, 0);
}

export function createOrderFromCart(
  cart: Cart,
  dishes: Dish[],
  priceResolver: (dish: Dish) => number,
  paymentMethod: OrderPaymentMethod,
  paymentReference: string
): Order | null {
  const items = buildOrderItemsFromCart(cart, dishes, priceResolver);
  if (!items.length) return null;
  const total = getOrderTotal(items);
  return {
    id: makeOrderId(),
    createdAt: new Date().toISOString(),
    items,
    total,
    status: "pending",
    paymentMethod,
    paymentReference: paymentReference.trim(),
  };
}

export function createAndStoreOrderFromCart(
  cart: Cart,
  dishes: Dish[],
  priceResolver: (dish: Dish) => number,
  paymentMethod: OrderPaymentMethod,
  paymentReference: string
) {
  const order = createOrderFromCart(cart, dishes, priceResolver, paymentMethod, paymentReference);
  if (!order) return null;
  addOrder(order);
  return order;
}

export function getRecentOrders(limit = 5) {
  return loadOrders().slice(0, Math.max(0, Math.floor(limit)));
}

import * as React from "react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  addToCart,
  cartCount,
  loadCart,
  removeFromCart,
  saveCart,
  type Cart,
} from "../lib/cart";
import { fetchDishes, type Dish } from "../lib/dishes";
import {
  buildOrderItemsFromCart,
  createAndStoreOrderFromCart,
  createPaymentReference,
  getOrderTotal,
  type OrderPaymentMethod,
} from "../lib/orders";
import { getEffectivePrice, loadOverrides, type PriceOverrides } from "../lib/price-overrides";

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [cart, setCart] = React.useState<Cart>({});
  const [overrides, setOverrides] = React.useState<PriceOverrides>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<OrderPaymentMethod>("manual_mpesa");
  const [paymentReference, setPaymentReference] = React.useState(createPaymentReference());

  React.useEffect(() => {
    fetchDishes()
      .then((data) => {
        setDishes(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load checkout data.");
        setLoading(false);
      });
    setCart(loadCart());
    setOverrides(loadOverrides());
  }, []);

  React.useEffect(() => {
    saveCart(cart);
  }, [cart]);

  const getDishPrice = React.useCallback(
    (dish: Dish) => getEffectivePrice(dish, overrides),
    [overrides]
  );

  const lines = React.useMemo(
    () => buildOrderItemsFromCart(cart, dishes, getDishPrice),
    [cart, dishes, getDishPrice]
  );

  const total = React.useMemo(() => getOrderTotal(lines), [lines]);
  const itemCount = cartCount(cart);

  const changeQty = (dishId: string, nextQty: number) => {
    setCart((prev) => {
      const currentQty = prev[dishId] || 0;
      if (nextQty <= 0) return removeFromCart(prev, dishId, currentQty || 1);
      if (nextQty > currentQty) return addToCart(prev, dishId, nextQty - currentQty);
      if (nextQty < currentQty) return removeFromCart(prev, dishId, currentQty - nextQty);
      return prev;
    });
  };

  const placeOrder = () => {
    const order = createAndStoreOrderFromCart(
      cart,
      dishes,
      getDishPrice,
      paymentMethod,
      paymentReference
    );
    if (!order) {
      setNotice("Cart is empty or invalid. Add items before placing order.");
      return;
    }
    saveCart({});
    setCart({});
    navigate("/orders");
  };

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt="MenuVista" className="h-11 w-11 rounded-2xl object-cover" />
            <div>
              <div className="text-xl font-black">
                Checkout <span className="text-orange-400">Menu</span>
                <span className="text-emerald-400">Vista</span>
              </div>
              <div className="text-sm text-white/60">{itemCount} item{itemCount === 1 ? "" : "s"}</div>
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-white hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
            Loading checkout...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-3 text-sm font-black uppercase tracking-wide text-white/70">Order Summary</div>
              {lines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/25 p-6 text-sm text-white/55">
                  Your cart is empty.
                </div>
              ) : (
                <div className="space-y-3">
                  {lines.map((line) => (
                    <div key={line.dishId} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold">{line.name}</div>
                          <div className="text-xs text-white/55">
                            {formatKsh(line.unitPrice)} each
                          </div>
                        </div>
                        <div className="text-sm font-bold text-orange-400">{formatKsh(line.subtotal)}</div>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-2 py-1">
                        <button
                          onClick={() => changeQty(line.dishId, line.quantity - 1)}
                          className="rounded-full p-1 text-white/75 hover:bg-white/10"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-6 text-center text-sm font-bold">{line.quantity}</span>
                        <button
                          onClick={() => changeQty(line.dishId, line.quantity + 1)}
                          className="rounded-full p-1 text-white/75 hover:bg-white/10"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-3 text-sm font-black uppercase tracking-wide text-white/70">Payment</div>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                  <input
                    type="radio"
                    checked={paymentMethod === "manual_mpesa"}
                    onChange={() => setPaymentMethod("manual_mpesa")}
                  />
                  <span className="text-sm">Manual M-Pesa</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                  <input
                    type="radio"
                    checked={paymentMethod === "stk_push_placeholder"}
                    onChange={() => setPaymentMethod("stk_push_placeholder")}
                  />
                  <span className="text-sm">STK Push (Placeholder)</span>
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-1 text-xs text-white/60">Payment Reference</div>
                <input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none"
                  placeholder="Reference"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-white/60">Total</div>
                  <div className="text-2xl font-black text-orange-400">{formatKsh(total)}</div>
                </div>
              </div>

              {notice ? (
                <div className="mt-4 rounded-2xl border border-orange-400/25 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
                  {notice}
                </div>
              ) : null}

              <button
                onClick={placeOrder}
                className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={lines.length === 0}
              >
                Place Order
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

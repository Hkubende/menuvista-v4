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
  createOrderId,
  getOrderTotal,
} from "../lib/orders";
import { getEffectivePrice, loadOverrides, type PriceOverrides } from "../lib/price-overrides";

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;
const MPESA_TILL = "8711138";
const STK_API_BASE = (
  import.meta.env.VITE_STK_API_BASE || "https://menuvista-mpesa-backend.onrender.com"
).replace(/\/+$/, "");

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

function normalizePhoneKE(input: string) {
  const s = String(input || "").trim();
  if (/^07\d{8}$/.test(s)) return `254${s.slice(1)}`;
  if (/^2547\d{8}$/.test(s)) return s;
  if (/^\+2547\d{8}$/.test(s)) return s.slice(1);
  return null;
}

export default function Checkout() {
  const navigate = useNavigate();
  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [cart, setCart] = React.useState<Cart>({});
  const [overrides, setOverrides] = React.useState<PriceOverrides>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [pendingOrderId, setPendingOrderId] = React.useState(createOrderId());
  const [stkPhone, setStkPhone] = React.useState("");
  const [stkStatus, setStkStatus] = React.useState("Status: idle");
  const [stkLoading, setStkLoading] = React.useState(false);

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

  const clearAfterOrder = () => {
    saveCart({});
    setCart({});
    setPendingOrderId(createOrderId());
  };

  const completeOrder = (paymentMethod: "stk_push" | "manual_mpesa", paymentReference: string) => {
    const order = createAndStoreOrderFromCart(
      cart,
      dishes,
      getDishPrice,
      paymentMethod,
      paymentReference,
      pendingOrderId
    );
    if (!order) {
      setNotice("Cart is empty or invalid. Add items before placing order.");
      return false;
    }
    clearAfterOrder();
    navigate("/orders");
    return true;
  };

  const changeQty = (dishId: string, nextQty: number) => {
    setCart((prev) => {
      const currentQty = prev[dishId] || 0;
      if (nextQty <= 0) return removeFromCart(prev, dishId, currentQty || 1);
      if (nextQty > currentQty) return addToCart(prev, dishId, nextQty - currentQty);
      if (nextQty < currentQty) return removeFromCart(prev, dishId, currentQty - nextQty);
      return prev;
    });
  };

  const checkBackend = async () => {
    setStkStatus("Status: checking backend...");
    try {
      const res = await fetch(`${STK_API_BASE}/health`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setStkStatus(`Status: backend OK (${body.env || "unknown"})`);
      } else {
        setStkStatus(`Status: backend responded with error (${res.status}).`);
      }
    } catch {
      setStkStatus("Status: backend not reachable.");
    }
  };

  const payViaStk = async () => {
    if (!lines.length || total <= 0) {
      setNotice("Cart is empty. Add items before payment.");
      return;
    }
    const phone = normalizePhoneKE(stkPhone);
    if (!phone) {
      setStkStatus("Status: invalid phone. Use 07XXXXXXXX.");
      return;
    }

    setStkLoading(true);
    setStkStatus("Sending payment request...");
    try {
      const res = await fetch(`${STK_API_BASE}/stkpush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amount: total,
          accountRef: pendingOrderId,
          desc: "MenuVista Order",
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setStkStatus("Payment request sent. Please check your phone.");
        const ref = typeof body?.checkoutRequestId === "string" && body.checkoutRequestId
          ? body.checkoutRequestId
          : pendingOrderId;
        completeOrder("stk_push", ref);
      } else {
        setStkStatus(
          `Payment failed: ${
            body?.error || body?.details || body?.ResponseDescription || `HTTP ${res.status}`
          }`
        );
      }
    } catch {
      setStkStatus("Payment failed: backend not reachable.");
    } finally {
      setStkLoading(false);
    }
  };

  const copyPaymentDetails = async () => {
    const text =
      `MenuVista Manual Payment\nTill: ${MPESA_TILL}\nReference: ${pendingOrderId}\nAmount: ${total}\n\nItems:\n` +
      `${lines.map((line) => `${line.quantity} x ${line.name} = ${line.subtotal}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Payment details copied.");
    } catch {
      setNotice("Copy failed. Please copy details manually.");
    }
  };

  const confirmManualPayment = () => {
    if (!lines.length || total <= 0) {
      setNotice("Cart is empty. Add items before confirming payment.");
      return;
    }
    completeOrder("manual_mpesa", pendingOrderId);
  };

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
                          <div className="text-xs text-white/55">{formatKsh(line.unitPrice)} each</div>
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

            <div className="space-y-4">
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                <div className="mb-2 text-base font-black">Pay via STK Push</div>
                <div className="text-xs text-white/70">Enter phone and send STK request.</div>
                <div className="mt-3">
                  <div className="mb-1 text-xs text-white/60">Phone (07XXXXXXXX)</div>
                  <input
                    value={stkPhone}
                    onChange={(event) => setStkPhone(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
                    placeholder="0745XXXXXX"
                    inputMode="numeric"
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={payViaStk}
                    disabled={stkLoading || lines.length === 0}
                    className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {stkLoading ? "Sending payment request..." : "Pay via STK Push"}
                  </button>
                  <button
                    onClick={checkBackend}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.08]"
                  >
                    Check Backend
                  </button>
                </div>
                <div className="mt-2 text-xs text-white/75">{stkStatus}</div>
              </div>

              <div className="rounded-3xl border border-orange-400/20 bg-orange-500/10 p-5">
                <div className="mb-2 text-base font-black">Manual M-Pesa</div>
                <div className="space-y-1 text-sm text-white/85">
                  <div className="flex items-center justify-between">
                    <div className="text-white/60">Till Number</div>
                    <div className="font-mono text-white">{MPESA_TILL}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-white/60">Reference</div>
                    <div className="font-mono text-white">{pendingOrderId}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-white/60">Amount</div>
                    <div className="font-mono text-white">{formatKsh(total)}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={copyPaymentDetails}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.08]"
                  >
                    Copy payment details
                  </button>
                  <button
                    onClick={confirmManualPayment}
                    disabled={lines.length === 0}
                    className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    Send confirmation
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-white/60">Total</div>
                  <div className="text-2xl font-black text-orange-400">{formatKsh(total)}</div>
                </div>
              </div>

              {notice ? (
                <div className="rounded-2xl border border-orange-400/25 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
                  {notice}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

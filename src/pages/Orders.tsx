import * as React from "react";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPaymentMethodLabel,
  loadOrders,
  type Order,
  type OrderStatus,
} from "../lib/orders";

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

function statusClass(status: OrderStatus) {
  if (status === "completed") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
  if (status === "preparing") return "border-orange-400/30 bg-orange-500/15 text-orange-200";
  if (status === "confirmed") return "border-sky-400/30 bg-sky-500/15 text-sky-200";
  return "border-white/20 bg-white/10 text-white/80";
}

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<Order[]>([]);

  React.useEffect(() => {
    const refresh = () => setOrders(loadOrders());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt="MenuVista" className="h-11 w-11 rounded-2xl object-cover" />
            <div>
              <div className="text-xl font-black">
                My <span className="text-orange-400">Orders</span>
              </div>
              <div className="text-sm text-white/60">{orders.length} total</div>
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-white hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
            <ReceiptText className="mx-auto mb-3 h-10 w-10 text-white/40" />
            <div className="text-lg font-black text-orange-400">No orders yet</div>
            <div className="mt-2 text-sm text-white/60">
              Place your first order from checkout and it will appear here.
            </div>
            <button
              onClick={() => navigate("/checkout")}
              className="mt-5 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-bold text-black hover:bg-emerald-300"
            >
              Go to Checkout
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-white/50">Order ID</div>
                    <div className="font-mono text-sm text-white">{order.id}</div>
                  </div>
                  <div className="text-sm text-white/60">
                    {new Date(order.createdAt).toLocaleString("en-KE")}
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                    {order.status}
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-sm text-white/80">
                  {order.items.map((item) => (
                    <div key={`${order.id}-${item.dishId}`} className="flex items-center justify-between gap-3">
                      <div>
                        {item.quantity} x {item.name}
                      </div>
                      <div className="text-orange-300">{formatKsh(item.subtotal)}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
                  <div className="text-white/60">
                    {getPaymentMethodLabel(order.paymentMethod)} | Ref:{" "}
                    <span className="font-mono text-white/80">{order.paymentReference || "-"}</span>
                  </div>
                  <div className="text-lg font-black text-emerald-300">{formatKsh(order.total)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { loadMenuCatalog, type Dish } from "../lib/catalog";

type Cart = Record<string, number>;

const CART_KEY = "mv_cart_v1";
const PRICE_OVERRIDES_KEY = "mv_price_overrides_v1";

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

function loadOverrides(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PRICE_OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadCart(): Cart {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function MenuItemPage() {
  const navigate = useNavigate();
  const { dishId = "" } = useParams();
  const decodedDishId = React.useMemo(() => decodeURIComponent(dishId), [dishId]);

  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});
  const [added, setAdded] = React.useState(false);

  React.useEffect(() => {
    loadMenuCatalog()
      .then((data) => {
        setDishes(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load menu item");
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    const refreshOverrides = () => setOverrides(loadOverrides());
    refreshOverrides();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshOverrides();
    };

    window.addEventListener("focus", refreshOverrides);
    window.addEventListener("pageshow", refreshOverrides);
    window.addEventListener("storage", refreshOverrides);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshOverrides);
      window.removeEventListener("pageshow", refreshOverrides);
      window.removeEventListener("storage", refreshOverrides);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const dish = React.useMemo(
    () => dishes.find((item) => item.id === decodedDishId) || null,
    [dishes, decodedDishId]
  );

  const effectivePrice = React.useMemo(() => {
    if (!dish) return 0;
    return overrides[dish.id] != null ? Number(overrides[dish.id]) : dish.price;
  }, [dish, overrides]);

  const addToCart = () => {
    if (!dish) return;
    const cart = loadCart();
    cart[dish.id] = (cart[dish.id] || 0) + 1;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0b10] p-8 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/65">
          Loading menu item...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b0b10] p-8 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-center text-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="min-h-screen bg-[#0b0b10] p-8 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="text-2xl font-black text-orange-400">Menu item not found</div>
          <button
            onClick={() => navigate("/")}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </button>

          <button
            onClick={() => navigate(`/ar?dish=${encodeURIComponent(dish.id)}`)}
            className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400"
          >
            View in AR
          </button>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <img src={dish.thumb} alt={dish.name} className="h-[420px] w-full object-cover" />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-3 inline-flex rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-semibold text-white/80">
              {dish.cat}
            </div>
            <h1 className="text-4xl font-black text-orange-400">{dish.name}</h1>
            <p className="mt-4 text-base leading-7 text-white/70">{dish.desc}</p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/60">Current price</div>
              <div className="mt-1 text-3xl font-black text-emerald-400">
                {formatKsh(effectivePrice)}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={addToCart}
                className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-bold text-black hover:bg-emerald-300"
              >
                Add to Cart
              </button>
              <button
                onClick={() => navigate(`/ar?dish=${encodeURIComponent(dish.id)}`)}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              >
                AR Preview
              </button>
            </div>

            {added && (
              <p className="mt-4 text-sm font-semibold text-emerald-300">
                Added to cart.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

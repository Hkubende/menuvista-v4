import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Search,
  Clock3,
  X,
  Minus,
  Plus,
  ScanLine,
} from "lucide-react";
import {
  addToCart as addDishToCart,
  cartCount,
  cartTotal as getCartTotal,
  encodeCartPayload,
  loadCart,
  removeFromCart,
  saveCart,
  type Cart,
} from "./lib/cart";
import { fetchDishes, getCategories, getDishById, type Dish } from "./lib/dishes";
import { getEffectivePrice, loadOverrides, type PriceOverrides } from "./lib/price-overrides";
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

function LogoMark() {
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/20 via-emerald-400/10 to-transparent shadow-lg shadow-orange-500/10">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-emerald-400/50 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
          AR
        </div>
      </div>
    </div>
  );
}

function MenuItemCard({
  dish,
  onAdd,
  onOpen,
  onArPreview,
}: {
  dish: Dish;
  onAdd: (dish: Dish) => void;
  onOpen: (dishId: string) => void;
  onArPreview: (dishId: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      onClick={() => onOpen(dish.id)}
      className="group cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20"
    >
      <div className="relative h-52 overflow-hidden">
        <img
          src={dish.thumb}
          alt={dish.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
              {dish.cat}
            </div>
            <h3 className="text-xl font-bold text-white">{dish.name}</h3>
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              onAdd(dish);
            }}
            className="rounded-2xl bg-white/90 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-500 hover:text-white"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm leading-6 text-white/65">{dish.desc}</p>

        <div className="flex items-center justify-between text-sm">
          <div className="font-bold text-orange-400">{formatKsh(dish.price)}</div>
          <div className="inline-flex items-center gap-1.5 text-white/60">
            <Clock3 className="h-4 w-4" />
            5 mins
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onArPreview(dish.id);
            }}
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.08]"
          >
            AR Preview
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              onAdd(dish);
            }}
            className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("All");
  const [cart, setCart] = React.useState<Cart>({});
  const [cartOpen, setCartOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [overrides, setOverrides] = React.useState<PriceOverrides>({});

  React.useEffect(() => {
    fetchDishes()
      .then((data) => {
        setDishes(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message || "Failed to load menu data");
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    setCart(loadCart());
  }, []);

  React.useEffect(() => {
    saveCart(cart);
  }, [cart]);

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

  const getDishPrice = React.useCallback(
    (dish: Dish) => getEffectivePrice(dish, overrides),
    [overrides]
  );

  const pricedDishes = React.useMemo(
    () => dishes.map((dish) => ({ ...dish, price: getDishPrice(dish) })),
    [dishes, getDishPrice]
  );

  const categories = React.useMemo(() => getCategories(pricedDishes), [pricedDishes]);

  const filtered = React.useMemo(() => {
    return pricedDishes.filter((dish) => {
      const matchesCategory =
        activeCategory === "All" || dish.cat === activeCategory;

      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        dish.name.toLowerCase().includes(term) ||
        dish.cat.toLowerCase().includes(term) ||
        dish.desc.toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, pricedDishes, search]);

  const topDish = React.useMemo(() => {
    if (!pricedDishes.length) return null;
    return pricedDishes.reduce((a, b) => (a.price > b.price ? a : b));
  }, [pricedDishes]);

  const addToCart = (dish: Dish) => {
    setCart((prev) => addDishToCart(prev, dish.id));
    setCartOpen(true);
  };

  const changeQty = (dishId: string, nextQty: number) => {
    setCart((prev) => {
      const currentQty = prev[dishId] || 0;
      if (nextQty <= 0) return removeFromCart(prev, dishId, currentQty || 1);
      if (nextQty > currentQty) return addDishToCart(prev, dishId, nextQty - currentQty);
      if (nextQty < currentQty) return removeFromCart(prev, dishId, currentQty - nextQty);
      return prev;
    });
  };

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => {
      const dish = getDishById(pricedDishes, id);
      return dish ? { ...dish, qty } : null;
    })
    .filter(Boolean) as Array<Dish & { qty: number }>;

  const cartCountValue = cartCount(cart);
  const cartTotal = getCartTotal(cart, pricedDishes);

  const checkoutCart = () => {
    if (!cartItems.length) return;
    const payload = encodeCartPayload(cart);
    navigate(`/ar?checkout=1&cart=${payload}`);
  };

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 mb-8 rounded-3xl border border-white/10 bg-black/35 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <img
                src={LOGO_SRC}
                alt="MenuVista"
                className="h-12 w-12 rounded-2xl object-cover"
              />
              <div>
                <div className="flex items-center gap-3">
                  <LogoMark />
                  <div className="text-2xl font-black tracking-tight">
                    <span className="text-orange-400">Menu</span>
                    <span className="text-emerald-400">Vista</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-white/60">
                  See your food before you order.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[260px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dishes..."
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-orange-400/50"
                />
              </div>

              <button
                onClick={() => {
                  navigate("/dashboard");
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
              >
                Dashboard
              </button>

              <button
                onClick={() => setCartOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-orange-400"
              >
                <ShoppingCart className="h-4 w-4" />
                Cart ({cartCountValue})
              </button>
            </div>
          </div>
        </header>

        <section className="mb-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-orange-500/15 via-white/[0.03] to-emerald-400/10 p-6 sm:p-8">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/75">
                <ScanLine className="h-4 w-4 text-emerald-400" />
                AR Restaurant Experience
              </div>

              <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                Smart dining starts with{" "}
                <span className="text-orange-400">Menu</span>
                <span className="text-emerald-400">Vista</span>
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-white/65">
                Browse premium dishes, preview menu items in AR, and create a
                seamless restaurant ordering experience.
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <div className="text-sm font-semibold text-white/55">Quick Access</div>

            <div className="mt-3 text-2xl font-black text-orange-400">
              MenuVista
            </div>

            <p className="mt-2 text-sm leading-6 text-white/60">
              This React frontend connects smoothly to your existing AR viewer and
              dashboard.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <button
                onClick={() => {
                  navigate("/dashboard");
                }}
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-300"
              >
                Open Dashboard
              </button>

              <button
                onClick={() => {
                  navigate("/ar");
                }}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
              >
                Open AR Viewer
              </button>

              {topDish && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs text-white/50">Featured dish</div>
                  <div className="mt-1 text-lg font-bold text-orange-400">
                    {topDish.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Starting from {formatKsh(topDish.price)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mb-6 flex flex-wrap gap-3">
          {categories.map((category) => {
            const active = category === activeCategory;

            return (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  active
                    ? "bg-orange-500 text-black"
                    : "border border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.08]"
                }`}
              >
                {category}
              </button>
            );
          })}
        </section>

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
            Loading MenuVista dishes...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200">
            Failed to load menu data: {error}
          </div>
        )}

        {!loading && !error && (
          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((dish) => (
              <MenuItemCard
                key={dish.id}
                dish={dish}
                onAdd={addToCart}
                onOpen={(dishId) => navigate(`/menu/${encodeURIComponent(dishId)}`)}
                onArPreview={(dishId) => navigate(`/ar?dish=${encodeURIComponent(dishId)}`)}
              />
            ))}
          </section>
        )}
      </div>

      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCartOpen(false)}
            />

            <motion.aside
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#101017] p-5 shadow-2xl shadow-black/40"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-lg font-black">Your Cart</div>
                  <div className="text-sm text-white/55">
                    {cartCountValue} item{cartCountValue === 1 ? "" : "s"}
                  </div>
                </div>

                <button
                  onClick={() => setCartOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-2 text-white/80 hover:bg-white/[0.08]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {cartItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
                    Your cart is empty.
                  </div>
                ) : (
                  cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={item.thumb}
                          alt={item.name}
                          className="h-16 w-16 rounded-2xl object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold">{item.name}</div>
                          <div className="mt-1 text-sm text-white/50">
                            {formatKsh(item.price)} each
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-1">
                              <button
                                onClick={() => changeQty(item.id, item.qty - 1)}
                                className="rounded-full p-1 text-white/75 hover:bg-white/10"
                              >
                                <Minus className="h-4 w-4" />
                              </button>

                              <span className="min-w-6 text-center text-sm font-bold">
                                {item.qty}
                              </span>

                              <button
                                onClick={() => changeQty(item.id, item.qty + 1)}
                                className="rounded-full p-1 text-white/75 hover:bg-white/10"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="font-bold text-orange-400">
                              {formatKsh(item.price * item.qty)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-white/60">Total</span>
                  <span className="text-2xl font-black text-orange-400">
                    {formatKsh(cartTotal)}
                  </span>
                </div>

                <button
                  onClick={checkoutCart}
                  className="w-full rounded-2xl bg-orange-500 px-4 py-3 font-bold text-black transition hover:bg-orange-400"
                >
                  Proceed to Checkout
                </button>

                <p className="mt-3 text-xs leading-5 text-white/45">
                  This uses the same cart structure as your existing MenuVista flow.
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

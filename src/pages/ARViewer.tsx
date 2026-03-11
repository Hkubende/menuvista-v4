import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loadMenuCatalog, type Dish } from "../lib/catalog";
import "./ARViewer.css";

type Cart = Record<string, number>;

const CART_KEY = "mv_cart_v1";
const PRICE_OVERRIDES_KEY = "mv_price_overrides_v1";
const WHATSAPP_NUMBER = "254745482764";
const MPESA_METHOD = "TILL";
const MPESA_BIZ_NO = "8711138";
const STK_API_BASE = "https://menuvista-mpesa-backend.onrender.com";
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

function formatKsh(n: number) {
  return `KSh ${Number(n).toLocaleString("en-KE")}`;
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

function cartCount(cart: Cart) {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

function makeRef() {
  return `MV-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function ARViewer() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modelViewerRef = React.useRef<any>(null);

  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [toast, setToast] = React.useState("Loading 3D model...");
  const [supportChip, setSupportChip] = React.useState("Checking AR support...");
  const [arDisabled, setArDisabled] = React.useState(false);
  const [viewsText, setViewsText] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [checkoutCart, setCheckoutCart] = React.useState<Cart>({});
  const [checkoutRef, setCheckoutRef] = React.useState("");
  const [stkPhone, setStkPhone] = React.useState("");
  const [stkStatus, setStkStatus] = React.useState("Status: idle");

  const isIOS = React.useMemo(() => {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }, []);

  React.useEffect(() => {
    if (document.getElementById("model-viewer-module")) return;
    const script = document.createElement("script");
    script.id = "model-viewer-module";
    script.type = "module";
    script.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";
    document.head.appendChild(script);
  }, []);

  React.useEffect(() => {
    loadMenuCatalog()
      .then((data) => {
        setDishes(data);
      })
      .catch(() => {
        setToast("Failed to load data/dishes.json. Fix file path + JSON format.");
        setSupportChip("Data load error");
        setArDisabled(true);
      });
  }, []);

  const getEffectivePrice = React.useCallback((dish: Dish) => {
    const overrides = loadOverrides();
    return overrides[dish.id] != null ? Number(overrides[dish.id]) : Number(dish.price);
  }, []);

  const selectedDish = dishes[currentIndex];
  const selectedPrice = selectedDish ? getEffectivePrice(selectedDish) : 0;

  React.useEffect(() => {
    if (!dishes.length) return;
    const wanted = searchParams.get("dish");
    const idx = wanted ? dishes.findIndex((d) => d.id === wanted) : -1;
    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [dishes, searchParams]);

  React.useEffect(() => {
    if (!selectedDish) return;
    if (searchParams.get("dish") !== selectedDish.id) {
      const next = new URLSearchParams(window.location.search);
      next.set("dish", selectedDish.id);
      setSearchParams(next, { replace: true });
    }

    const key = `mv_views_${selectedDish.id}`;
    const v = parseInt(localStorage.getItem(key) || "0", 10) + 1;
    localStorage.setItem(key, String(v));
    setViewsText(`${v} view${v === 1 ? "" : "s"} (this browser)`);

    setToast("Loading 3D model...");
    const mv = modelViewerRef.current;
    if (mv) mv.src = selectedDish.model;
  }, [selectedDish, setSearchParams, searchParams]);

  React.useEffect(() => {
    const mv = modelViewerRef.current;
    if (!mv) return;

    const onLoad = () => setToast("");
    const onError = () => {
      setToast("Model failed to load. Check filename/path (case-sensitive).");
      setArDisabled(true);
      setSupportChip("Model load error");
    };

    mv.addEventListener("load", onLoad);
    mv.addEventListener("error", onError);
    return () => {
      mv.removeEventListener("load", onLoad);
      mv.removeEventListener("error", onError);
    };
  }, [selectedDish]);

  React.useEffect(() => {
    const mv = modelViewerRef.current;
    if (!mv) return;

    let startX = 0;
    let startY = 0;
    let isDown = false;
    const SWIPE_MIN = 50;
    const SWIPE_MAX_Y = 80;

    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length !== 1) return;
      isDown = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isDown) return;
      isDown = false;
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dy) > SWIPE_MAX_Y) return;
      if (dx > SWIPE_MIN) setCurrentIndex((i) => (i - 1 + dishes.length) % dishes.length);
      else if (dx < -SWIPE_MIN) setCurrentIndex((i) => (i + 1) % dishes.length);
    };

    mv.addEventListener("touchstart", onTouchStart, { passive: true });
    mv.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      mv.removeEventListener("touchstart", onTouchStart);
      mv.removeEventListener("touchend", onTouchEnd);
    };
  }, [dishes.length]);

  React.useEffect(() => {
    const timer = window.setTimeout(async () => {
      const mv = modelViewerRef.current;
      if (!mv) return;

      let webxrAR = false;
      const xrNavigator = navigator as Navigator & {
        xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
      };
      if (xrNavigator.xr?.isSessionSupported) {
        try {
          webxrAR = await xrNavigator.xr.isSessionSupported("immersive-ar");
        } catch {
          webxrAR = false;
        }
      }

      if (webxrAR) {
        setArDisabled(false);
        setSupportChip("AR supported (WebXR)");
        return;
      }

      const mvAR = !!mv.canActivateAR;
      if (isIOS) {
        setArDisabled(!mvAR);
        setSupportChip(mvAR ? "AR supported (iOS)" : "AR limited on iOS");
        return;
      }

      if (mvAR) {
        setArDisabled(false);
        setSupportChip("AR available (Android)");
      } else {
        setArDisabled(true);
        setSupportChip("AR not supported");
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [selectedDish, isIOS]);

  const cartTotal = React.useCallback(
    (cart: Cart) => {
      let total = 0;
      for (const [id, qty] of Object.entries(cart)) {
        const dish = dishes.find((x) => x.id === id);
        if (!dish) continue;
        total += getEffectivePrice(dish) * qty;
      }
      return total;
    },
    [dishes, getEffectivePrice]
  );

  const checkoutLines = React.useMemo(() => {
    const lines: string[] = [];
    for (const [id, qty] of Object.entries(checkoutCart)) {
      const dish = dishes.find((x) => x.id === id);
      if (!dish) continue;
      const unit = getEffectivePrice(dish);
      lines.push(`${qty} x ${dish.name} @ ${formatKsh(unit)} = ${formatKsh(unit * qty)}`);
    }
    return lines;
  }, [checkoutCart, dishes, getEffectivePrice]);

  const checkoutTotal = React.useMemo(() => cartTotal(checkoutCart), [cartTotal, checkoutCart]);

  React.useEffect(() => {
    if (!dishes.length) return;
    if (searchParams.get("checkout") !== "1") return;
    let cart: Cart = {};
    const encoded = searchParams.get("cart");
    if (encoded) {
      try {
        cart = JSON.parse(atob(decodeURIComponent(encoded)));
      } catch {
        cart = {};
      }
    } else {
      cart = loadCart();
    }
    if (cartCount(cart) === 0) return;
    setCheckoutCart(cart);
    setCheckoutRef(makeRef());
    setModalOpen(true);
  }, [dishes, searchParams]);

  const openCheckout = () => {
    const cart = loadCart();
    if (cartCount(cart) === 0) {
      alert("Cart is empty.");
      return;
    }
    setCheckoutCart(cart);
    setCheckoutRef(makeRef());
    setModalOpen(true);
  };

  const normalizePhoneKE = (input: string) => {
    const s = String(input || "").trim();
    if (/^07\d{8}$/.test(s)) return `254${s.slice(1)}`;
    if (/^2547\d{8}$/.test(s)) return s;
    if (/^\+2547\d{8}$/.test(s)) return s.slice(1);
    return null;
  };

  const checkBackend = async () => {
    setStkStatus("Status: checking backend...");
    try {
      const res = await fetch(`${STK_API_BASE}/health`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j && j.ok) {
        setStkStatus(`Status: backend OK (${j.env || "unknown"})`);
      } else {
        setStkStatus("Status: backend responded but not OK");
      }
    } catch {
      setStkStatus("Status: backend not reachable. Deploy STK backend or use manual M-Pesa.");
    }
  };

  const triggerStk = async () => {
    if (cartCount(checkoutCart) === 0) {
      setStkStatus("Status: cart is empty.");
      return;
    }
    const phone = normalizePhoneKE(stkPhone);
    if (!phone) {
      setStkStatus("Status: Invalid phone. Use 07XXXXXXXX.");
      return;
    }
    const total = checkoutTotal;
    setStkStatus("Status: sending STK request...");
    try {
      const res = await fetch(`${STK_API_BASE}/stkpush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amount: total,
          accountRef: checkoutRef || makeRef(),
          desc: "MenuVista Order",
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j && j.ok) {
        setStkStatus("Status: STK accepted. Check your phone to complete payment.");
      } else {
        setStkStatus(
          `Status: STK failed - ${j && (j.error || j.details) ? j.error || j.details : "unknown error"}`
        );
      }
    } catch {
      setStkStatus("Status: Backend not reachable. Deploy STK backend or use manual M-Pesa.");
    }
  };

  const copyPaymentDetails = async () => {
    const paymentText =
      `MenuVista Order Payment\nMethod: ${MPESA_METHOD}\nBusiness No: ${MPESA_BIZ_NO}\nReference: ${checkoutRef}\nAmount: ${checkoutTotal}\n\nOrder:\n` +
      `${checkoutLines.join("\n")}\nTotal: ${checkoutTotal}`;
    try {
      await navigator.clipboard.writeText(paymentText);
      alert("Copied payment details.");
    } catch {
      alert("Copy failed. Please copy manually.");
    }
  };

  const selectedMsg = selectedDish
    ? `Hello, I want to order 1 x ${selectedDish.name} @ ${formatKsh(selectedPrice)}.`
    : "";
  const orderMsg =
    `Hello, I want to place an order:\n\n${checkoutLines.join("\n")}\nTOTAL: ${formatKsh(checkoutTotal)}\n\n` +
    `Payment method: M-Pesa (${MPESA_METHOD})\nReference: ${checkoutRef}`;
  const confirmMsg =
    `Hello, I have paid via M-Pesa.\n\nReference: ${checkoutRef}\nAmount: ${formatKsh(checkoutTotal)}\n\n` +
    "Please confirm and process my order.";

  return (
    <div className="ar-page">
      <div className="ar-topbar">
        <button className="ar-brand-btn" onClick={() => navigate("/")}>
          <img className="ar-logo-img" src={LOGO_SRC} alt="MenuVista logo" />
          <div className="ar-brand-name">MenuVista</div>
        </button>
        <div className="ar-chip">{supportChip}</div>
      </div>

      <model-viewer
        ref={modelViewerRef}
        className="ar-viewer"
        src=""
        camera-controls=""
        auto-rotate=""
        rotation-per-second="20deg"
        shadow-intensity="1"
        environment-image="neutral"
        exposure="1.0"
        ar=""
        ar-modes="webxr scene-viewer quick-look"
        ar-placement="floor"
      />

      {toast ? <div className="ar-toast">{toast}</div> : null}

      <div className="ar-panel">
        <div style={{ maxWidth: "58ch" }}>
          <p className="ar-title">{selectedDish ? selectedDish.name : "Loading..."}</p>
          <p className="ar-meta">
            <span className="ar-price">{formatKsh(selectedPrice)}</span>{" "}
            <span>{selectedDish ? `- ${selectedDish.desc}` : ""}</span>
          </p>
          <p className="ar-meta">
            Swipe left/right to change dishes. Tap "View in AR" to place on table.
          </p>
          <div className="ar-hint">{viewsText}</div>
        </div>
        <div className="ar-actions">
          <button
            className="ar-btn ghost"
            onClick={() =>
              setCurrentIndex((i) => (i - 1 + dishes.length) % (dishes.length || 1))
            }
            disabled={!dishes.length}
          >
            Prev
          </button>
          <button
            className="ar-btn ghost"
            onClick={() => setCurrentIndex((i) => (i + 1) % (dishes.length || 1))}
            disabled={!dishes.length}
          >
            Next
          </button>
          <button
            className="ar-btn ghost"
            onClick={() => {
              const mv = modelViewerRef.current;
              if (!mv) return;
              mv.cameraOrbit = "0deg 75deg 2.5m";
              mv.fieldOfView = "30deg";
            }}
          >
            Reset
          </button>
          <button className="ar-btn ghost" onClick={openCheckout}>
            Cart Checkout
          </button>
          <button
            className="ar-btn wa"
            onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(selectedMsg)}`, "_blank")}
            disabled={!selectedDish}
          >
            WhatsApp Order
          </button>
          <button
            className="ar-btn primary"
            onClick={async () => {
              try {
                await modelViewerRef.current?.activateAR();
              } catch {
                setToast("AR could not start on this device. Using 3D preview instead.");
              }
            }}
            disabled={arDisabled || !selectedDish}
          >
            View in AR
          </button>
        </div>
      </div>

      {modalOpen ? <div className="fixed inset-0 z-[80] bg-black/65" onClick={() => setModalOpen(false)} /> : null}
      {modalOpen ? (
        <div className="fixed left-1/2 top-1/2 z-[90] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-[#101017]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-5 py-4">
            <div className="text-lg font-black tracking-tight">
              Checkout <span className="text-orange-400">Menu</span>
              <span className="text-emerald-400">Vista</span>
            </div>
            <button
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.08]"
              onClick={() => setModalOpen(false)}
            >
              X
            </button>
          </div>

          <div className="max-h-[78vh] space-y-4 overflow-y-auto p-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 text-sm font-black uppercase tracking-wide text-white/70">
                Order Summary
              </div>
              <div className="space-y-1 text-sm text-white/85">
                {checkoutLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/60">Total</div>
                <div className="text-2xl font-black text-orange-400">{formatKsh(checkoutTotal)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-white/60">Reference</div>
                <div className="font-mono text-white">{checkoutRef}</div>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <div className="mb-1 text-base font-black">Pay via STK Push (Online)</div>
              <div className="text-xs text-white/70">If backend is offline, use manual M-Pesa below.</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-white/60">Phone (07XXXXXXXX)</div>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-emerald-400/40"
                    value={stkPhone}
                    onChange={(e) => setStkPhone(e.target.value)}
                    placeholder="0745XXXXXX"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/60">Backend</div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white/85">
                    {STK_API_BASE}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300"
                  onClick={triggerStk}
                >
                  Pay via STK Push
                </button>
                <button
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                  onClick={checkBackend}
                >
                  Check Backend
                </button>
              </div>
              <div className="mt-2 text-xs text-white/75">{stkStatus}</div>
            </div>

            <div className="rounded-3xl border border-orange-400/20 bg-orange-500/10 p-4">
              <div className="mb-2 text-base font-black">Pay via M-Pesa (Manual)</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-white/65">Method</div>
                  <div className="font-mono text-white">{MPESA_METHOD}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-white/65">Till Number</div>
                  <div className="font-mono text-white">{MPESA_BIZ_NO}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-white/65">Account / Reference</div>
                  <div className="font-mono text-white">{checkoutRef}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-white/65">Amount</div>
                  <div className="font-mono text-white">{formatKsh(checkoutTotal)}</div>
                </div>
              </div>

              <button
                className="mt-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                onClick={copyPaymentDetails}
              >
                Copy payment details
              </button>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(confirmMsg)}`,
                      "_blank"
                    )
                  }
                >
                  Send Confirmation on WhatsApp
                </button>
                <button
                  className="rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-orange-400"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(orderMsg)}`,
                      "_blank"
                    )
                  }
                >
                  Place Order (WhatsApp)
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

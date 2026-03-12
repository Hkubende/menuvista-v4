import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  cartCount,
  cartTotal as getCartTotal,
  decodeCartPayload,
  loadCart,
  type Cart,
} from "../lib/cart";
import { fetchDishes, getDishById, type Dish } from "../lib/dishes";
import { getEffectivePrice } from "../lib/price-overrides";
import { incrementViews } from "../lib/views";

const MPESA_METHOD = "TILL";
const MPESA_BIZ_NO = "8711138";
const STK_API_BASE = (
  import.meta.env.VITE_STK_API_BASE || "https://menuvista-mpesa-backend.onrender.com"
).replace(/\/+$/, "");
const BACKEND_TIMEOUT_MS = 15000;
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

function formatKsh(n: number) {
  return `KSh ${Number(n).toLocaleString("en-KE")}`;
}

function makeRef() {
  return `MV-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = BACKEND_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export default function ARViewer() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modelViewerRef = React.useRef<any>(null);

  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [initializedFromUrl, setInitializedFromUrl] = React.useState(false);
  const [currentModelSrc, setCurrentModelSrc] = React.useState("");
  const [modelLoading, setModelLoading] = React.useState(true);
  const [toast, setToast] = React.useState("Loading 3D model...");
  const [panelNotice, setPanelNotice] = React.useState("");
  const [supportChip, setSupportChip] = React.useState("Checking AR support...");
  const [arDisabled, setArDisabled] = React.useState(false);
  const [dishNotice, setDishNotice] = React.useState("");
  const [viewsText, setViewsText] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [checkoutCart, setCheckoutCart] = React.useState<Cart>({});
  const [checkoutRef, setCheckoutRef] = React.useState("");
  const [stkPhone, setStkPhone] = React.useState("");
  const [stkStatus, setStkStatus] = React.useState("Status: idle");
  const [showMeta, setShowMeta] = React.useState(false);

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
    fetchDishes()
      .then((data) => {
        if (!data.length) {
          setToast("No dishes available. Add at least one dish in dashboard.");
          setPanelNotice("No dishes are available right now. Please add dishes from dashboard.");
          setSupportChip("No dishes found");
          setArDisabled(true);
          return;
        }
        setDishes(data);
      })
      .catch(() => {
        setToast("Failed to load data/dishes.json. Fix file path + JSON format.");
        setPanelNotice("We could not load dishes. Please refresh or check dashboard data.");
        setSupportChip("Data load error");
        setArDisabled(true);
      });
  }, []);

  const getDishPrice = React.useCallback((dish: Dish) => getEffectivePrice(dish), []);

  const selectedDish = dishes[currentIndex];
  const selectedPrice = selectedDish ? getDishPrice(selectedDish) : 0;

  React.useEffect(() => {
    if (!dishes.length) return;
    const wanted = searchParams.get("dish");
    const idx = wanted ? dishes.findIndex((d) => d.id === wanted) : -1;
    if (wanted && idx < 0) {
      setDishNotice(`Dish "${wanted}" not found. Showing ${dishes[0].name}.`);
    } else {
      setDishNotice("");
    }
    setCurrentIndex(idx >= 0 ? idx : 0);
    setInitializedFromUrl(true);
  }, [dishes, searchParams]);

  React.useEffect(() => {
    if (!selectedDish || !initializedFromUrl) return;
    const modelSrc = String(selectedDish.model || "").trim();
    if (!modelSrc) {
      setCurrentModelSrc("");
      setModelLoading(false);
      setToast(`No 3D model found for "${selectedDish.name}".`);
      setPanelNotice(`"${selectedDish.name}" has no model file yet. Choose another dish or upload a model.`);
      setSupportChip("No model file");
      setArDisabled(true);
      return;
    }

    setModelLoading(true);
    setCurrentModelSrc(modelSrc);
    if (searchParams.get("dish") !== selectedDish.id) {
      const next = new URLSearchParams(window.location.search);
      next.set("dish", selectedDish.id);
      setSearchParams(next, { replace: true });
    }

    const v = incrementViews(selectedDish.id);
    setViewsText(`${v} view${v === 1 ? "" : "s"} (this browser)`);

    setToast("Loading 3D model...");
  }, [selectedDish, setSearchParams, searchParams, initializedFromUrl]);

  React.useEffect(() => {
    const mv = modelViewerRef.current;
    if (!mv) return;

    const onLoaded = () => {
      setToast("");
      setModelLoading(false);
    };
    const onError = () => {
      setToast("Model failed to load. Check filename/path (case-sensitive).");
      setPanelNotice("Model file is missing or invalid. Try another dish or re-upload the model.");
      setArDisabled(true);
      setSupportChip("Model load error");
      setModelLoading(false);
    };

    mv.addEventListener("load", onLoaded);
    mv.addEventListener("error", onError);
    return () => {
      mv.removeEventListener("load", onLoaded);
      mv.removeEventListener("error", onError);
    };
  }, [selectedDish]);

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

  const checkoutLines = React.useMemo(() => {
    const lines: string[] = [];
    for (const [id, qty] of Object.entries(checkoutCart)) {
      const dish = getDishById(dishes, id);
      if (!dish) continue;
      const unit = getDishPrice(dish);
      lines.push(`${qty} x ${dish.name} @ ${formatKsh(unit)} = ${formatKsh(unit * qty)}`);
    }
    return lines;
  }, [checkoutCart, dishes, getDishPrice]);

  const checkoutTotal = React.useMemo(
    () => getCartTotal(checkoutCart, dishes, getDishPrice),
    [checkoutCart, dishes, getDishPrice]
  );

  React.useEffect(() => {
    if (!dishes.length) return;
    if (searchParams.get("checkout") !== "1") return;
    let cart: Cart = {};
    const encoded = searchParams.get("cart");
    const isEncodedCheckout = !!encoded;
    if (encoded) {
      cart = decodeCartPayload(encoded);
    } else {
      cart = loadCart();
    }
    if (cartCount(cart) === 0) {
      setModalOpen(false);
      setPanelNotice(
        isEncodedCheckout
          ? "Invalid checkout link. Please go back to Menu and try checkout again."
          : "Your cart is empty. Add items before opening checkout."
      );
      return;
    }
    setPanelNotice("");
    setCheckoutCart(cart);
    setCheckoutRef(makeRef());
    setModalOpen(true);
  }, [dishes, searchParams]);

  const openCheckout = () => {
    const cart = loadCart();
    if (cartCount(cart) === 0) {
      setPanelNotice("Your cart is empty. Add items before checkout.");
      return;
    }
    setPanelNotice("");
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
      const res = await fetchWithTimeout(`${STK_API_BASE}/health`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j && j.ok) {
        setStkStatus(`Status: backend OK (${j.env || "unknown"})`);
        setPanelNotice("");
      } else {
        setStkStatus(`Status: backend responded but not OK (${res.status})`);
        setPanelNotice("Payment backend is not healthy right now. Use manual M-Pesa checkout.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStkStatus("Status: backend timed out.");
      } else {
        setStkStatus("Status: backend not reachable. Deploy STK backend or use manual M-Pesa.");
      }
      setPanelNotice("Payment backend is unreachable. Use manual M-Pesa checkout.");
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
      const res = await fetchWithTimeout(`${STK_API_BASE}/stkpush`, {
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
          `Status: STK failed (${res.status}) - ${j && (j.error || j.details) ? j.error || j.details : "unknown error"}`
        );
        setPanelNotice("STK push failed. Confirm your number or use manual M-Pesa.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStkStatus("Status: STK request timed out. Try again.");
      } else {
        setStkStatus("Status: Backend not reachable. Deploy STK backend or use manual M-Pesa.");
      }
      setPanelNotice("Payment backend is unreachable. Use manual M-Pesa checkout.");
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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0b10] text-white">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-2 md:inset-x-5 md:top-5">
        <button
          className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-black/45 px-3 text-xs font-bold text-white backdrop-blur-xl transition hover:bg-black/60 sm:h-11 sm:text-sm"
          onClick={() => navigate("/")}
        >
          <img src={LOGO_SRC} alt="MenuVista logo" className="h-5 w-5 rounded-md object-cover sm:h-6 sm:w-6" />
          <span>MenuVista</span>
        </button>
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur-xl sm:text-xs">
          {supportChip}
        </div>
      </div>

      <model-viewer
        ref={modelViewerRef}
        className={`h-full w-full transition-opacity duration-300 ${modelLoading ? "opacity-0" : "opacity-100"}`}
        style={{
          background:
            "radial-gradient(1200px 700px at 50% 70%, rgba(255,122,47,.16), transparent 62%), radial-gradient(900px 520px at 35% 35%, rgba(58,63,159,.22), transparent 58%), #0b0b10",
        }}
        src={currentModelSrc}
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

      {modelLoading && selectedDish ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          <img
            src={selectedDish.thumb}
            alt={selectedDish.name}
            className="h-full w-full scale-105 object-cover blur-xl"
          />
          <div className="absolute inset-0 bg-black/45" />
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 max-w-[88vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-center text-xs text-white/90 backdrop-blur-xl sm:text-sm">
          {toast}
        </div>
      ) : null}

      {dishNotice ? (
        <div className="pointer-events-none absolute left-1/2 top-20 z-20 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-orange-400/25 bg-black/60 px-3 py-2 text-center text-[11px] font-semibold text-orange-300 backdrop-blur-xl sm:top-24 sm:text-xs">
          {dishNotice}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-black/55 via-black/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-30 px-2 pb-2 md:px-4 md:pb-4">
        <div className="mx-auto mb-2 flex w-fit max-w-[94vw] items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
          <div className="max-w-[42vw] truncate text-xs font-bold text-white sm:max-w-[340px] sm:text-sm">
            {selectedDish ? selectedDish.name : "Loading..."}
          </div>
          <div className="text-xs font-black text-orange-400 sm:text-sm">{formatKsh(selectedPrice)}</div>
        </div>

        {panelNotice ? (
          <div className="mx-auto mb-2 w-full max-w-xl rounded-2xl border border-orange-400/25 bg-black/65 px-3 py-2 text-center text-xs text-orange-200 backdrop-blur-xl">
            {panelNotice}
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/10 bg-black/55 p-2.5 shadow-2xl shadow-black/45 backdrop-blur-xl transition-all duration-300 md:p-3">
          <div className="max-h-[25vh] overflow-y-auto md:max-h-none">
            <div className="grid grid-cols-3 gap-2">
              <button
                className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-2 text-sm font-bold text-white transition hover:bg-white/[0.1]"
                onClick={() =>
                  setCurrentIndex((i) => (i - 1 + dishes.length) % (dishes.length || 1))
                }
                disabled={!dishes.length}
              >
                Prev
              </button>
              <button
                className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-2 text-sm font-bold text-white transition hover:bg-white/[0.1]"
                onClick={() => setCurrentIndex((i) => (i + 1) % (dishes.length || 1))}
                disabled={!dishes.length}
              >
                Next
              </button>
              <button
                className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-2 text-sm font-bold text-white transition hover:bg-white/[0.1]"
                onClick={() => {
                  const mv = modelViewerRef.current;
                  if (!mv) return;
                  mv.cameraOrbit = "0deg 75deg 2.5m";
                  mv.fieldOfView = "30deg";
                }}
              >
                Reset
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-2xl bg-emerald-400 px-2 text-sm font-bold text-black transition hover:bg-emerald-300"
                onClick={() => navigate("/orders")}
              >
                Orders
              </button>
              <button
                className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-2 text-sm font-bold text-white transition hover:bg-white/[0.1]"
                onClick={openCheckout}
              >
                Checkout
              </button>
            </div>

            <button
              className="mt-2 min-h-11 w-full rounded-2xl bg-orange-500 px-3 text-sm font-black text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
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

            <div className="mt-2 flex items-center justify-between">
              <button
                className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-white/75 transition hover:bg-white/[0.1] sm:text-xs"
                onClick={() => setShowMeta((prev) => !prev)}
              >
                {showMeta ? "Hide Details" : "Show Details"}
              </button>
              <div className="truncate text-[10px] text-white/45 sm:text-xs">{viewsText}</div>
            </div>

            {showMeta && (
              <div className="mt-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-4 text-white/70 sm:text-xs sm:leading-5">
                {selectedDish ? selectedDish.desc : "Preparing model..."}
              </div>
            )}
          </div>
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

              <div className="mt-3">
                <button
                  className="w-full rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300"
                  onClick={() => navigate("/checkout")}
                >
                  Continue to In-App Checkout
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

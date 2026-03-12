import * as React from "react";
import { ArrowLeft, Eye, PencilLine, PlusCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  loadCustomProducts,
  fetchDishes,
  saveCustomProducts,
  type Dish,
} from "../lib/dishes";
import { deleteLocalAsset, isLocalAssetPath, saveLocalAsset } from "../lib/localAssets";
import {
  getEffectivePrice,
  loadOverrides,
  saveOverrides,
  type PriceOverrides,
} from "../lib/price-overrides";
import { getViews, resetViews } from "../lib/views";
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;
const EMPTY_PRODUCT = {
  id: "",
  cat: "",
  name: "",
  price: "",
  desc: "",
  model: "",
  thumb: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatKsh(value: number) {
  return `KSh ${value.toLocaleString("en-KE")}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [overrides, setOverrides] = React.useState<PriceOverrides>({});
  const [overrideDrafts, setOverrideDrafts] = React.useState<Record<string, string>>({});
  const [customIds, setCustomIds] = React.useState<Set<string>>(new Set());
  const [viewsVersion, setViewsVersion] = React.useState(0);
  const [adminNotice, setAdminNotice] = React.useState("");
  const [newProduct, setNewProduct] = React.useState(EMPTY_PRODUCT);
  const [formError, setFormError] = React.useState("");
  const [formSuccess, setFormSuccess] = React.useState("");
  const [showNewProductForm, setShowNewProductForm] = React.useState(false);
  const [thumbFile, setThumbFile] = React.useState<File | null>(null);
  const [modelFile, setModelFile] = React.useState<File | null>(null);
  const [uploadKey, setUploadKey] = React.useState(0);

  const refreshCatalog = React.useCallback(() => {
    setLoading(true);
    return fetchDishes()
      .then((data) => {
        setDishes(data);
        const ids = new Set(loadCustomProducts().map((item) => item.id));
        setCustomIds(ids);
        setError("");
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load dashboard");
        setLoading(false);
      });
  }, []);

  const refreshAdminState = React.useCallback(() => {
    setOverrides(loadOverrides());
    setViewsVersion((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    refreshAdminState();
    void refreshCatalog();
  }, [refreshCatalog, refreshAdminState]);

  React.useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const dish of dishes) {
      nextDrafts[dish.id] =
        overrides[dish.id] != null && Number.isFinite(Number(overrides[dish.id]))
          ? String(overrides[dish.id])
          : "";
    }
    setOverrideDrafts(nextDrafts);
  }, [dishes, overrides]);

  React.useEffect(() => {
    const syncAdmin = () => refreshAdminState();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncAdmin();
    };
    window.addEventListener("focus", syncAdmin);
    window.addEventListener("pageshow", syncAdmin);
    window.addEventListener("storage", syncAdmin);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncAdmin);
      window.removeEventListener("pageshow", syncAdmin);
      window.removeEventListener("storage", syncAdmin);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshAdminState]);

  const totalViews = React.useMemo(
    () => dishes.reduce((sum, dish) => sum + getViews(dish.id), 0),
    [dishes, viewsVersion]
  );

  const topDish = React.useMemo(() => {
    if (!dishes.length) return null;
    return [...dishes].sort((a, b) => getViews(b.id) - getViews(a.id))[0];
  }, [dishes, viewsVersion]);

  const effectivePrice = (dish: Dish) => getEffectivePrice(dish, overrides);

  const updatePriceDraft = (id: string, value: string) => {
    setOverrideDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const persistPrices = () => {
    const next: PriceOverrides = {};
    for (const dish of dishes) {
      const raw = (overrideDrafts[dish.id] || "").trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setAdminNotice(`Invalid override price for "${dish.name}". Use a number above 0.`);
        return;
      }
      next[dish.id] = parsed;
    }
    saveOverrides(next);
    setOverrides(next);
    setAdminNotice("Price overrides saved.");
  };

  const handleResetViews = () => {
    resetViews(dishes.map((dish) => dish.id));
    setViewsVersion((prev) => prev + 1);
    setAdminNotice("Views reset.");
  };

  const handleNewProductChange =
    (field: keyof typeof EMPTY_PRODUCT) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setNewProduct((prev) => {
        const next = { ...prev, [field]: value };
        if (field === "name" && !prev.id.trim()) {
          next.id = slugify(value);
        }
        return next;
      });
    };

  const addNewProduct = async () => {
    setFormError("");
    setFormSuccess("");
    const canonicalId = slugify(newProduct.id || newProduct.name);
    if (!canonicalId) {
      setFormError("Product name or ID is required.");
      return;
    }
    let resolvedThumb = newProduct.thumb.trim();
    let resolvedModel = newProduct.model.trim();
    try {
      resolvedThumb = thumbFile
        ? await saveLocalAsset(thumbFile, "thumb", canonicalId)
        : newProduct.thumb.trim();
      resolvedModel = modelFile
        ? await saveLocalAsset(modelFile, "model", canonicalId)
        : newProduct.model.trim();
    } catch {
      setFormError("Failed to save uploaded files. Try again.");
      return;
    }

    const nextProduct: Dish = {
      id: canonicalId,
      cat: newProduct.cat.trim(),
      name: newProduct.name.trim(),
      price: Number(newProduct.price),
      desc: newProduct.desc.trim(),
      model: resolvedModel,
      thumb: resolvedThumb,
    };

    if (
      !nextProduct.id ||
      !nextProduct.cat ||
      !nextProduct.name ||
      !nextProduct.desc ||
      !nextProduct.model ||
      !nextProduct.thumb ||
      !Number.isFinite(nextProduct.price) ||
      nextProduct.price <= 0
    ) {
      setFormError("Fill all fields with valid values before adding a product.");
      return;
    }

    if (
      !nextProduct.model.toLowerCase().endsWith(".glb") &&
      !isLocalAssetPath(nextProduct.model)
    ) {
      setFormError("Model URL/path must end with .glb, or upload a .glb file.");
      return;
    }

    if (dishes.some((dish) => dish.id === nextProduct.id)) {
      setFormError("A product with this ID already exists.");
      return;
    }

    const custom = loadCustomProducts();
    custom.push(nextProduct);
    saveCustomProducts(custom);

    setNewProduct(EMPTY_PRODUCT);
    setThumbFile(null);
    setModelFile(null);
    setUploadKey((prev) => prev + 1);
    setFormSuccess(`Added "${nextProduct.name}" to your local catalog.`);
    void refreshCatalog();
  };

  const removeCustomProduct = async (id: string) => {
    try {
      const existing = loadCustomProducts().find((item) => item.id === id);
      if (existing) {
        await deleteLocalAsset(existing.thumb);
        await deleteLocalAsset(existing.model);
      }
      const custom = loadCustomProducts().filter((item) => item.id !== id);
      saveCustomProducts(custom);
      setAdminNotice("Custom product deleted.");
      void refreshCatalog();
    } catch {
      setAdminNotice("Delete failed. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <img src={LOGO_SRC} alt="MenuVista" className="h-12 w-12 rounded-2xl object-cover" />
            <div>
              <div className="text-2xl font-black">
                <span className="text-orange-400">Menu</span>
                <span className="text-emerald-400">Vista</span> Dashboard
              </div>
              <p className="mt-1 text-sm text-white/60">Manage menu items, prices, and views.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Menu
            </button>

            <button
              onClick={persistPrices}
              className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-black hover:bg-orange-400"
            >
              Save Price Overrides
            </button>

            <button
              onClick={handleResetViews}
              className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-300"
            >
              Reset Views
            </button>

            <button
              onClick={() => setShowNewProductForm((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.08]"
            >
              <PlusCircle className="h-4 w-4" />
              Add New Product
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/55">Total dishes</div>
            <div className="mt-2 text-3xl font-black text-orange-400">{dishes.length}</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/55">Total views</div>
            <div className="mt-2 text-3xl font-black text-orange-400">{totalViews}</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/55">Top dish</div>
            <div className="mt-2 text-xl font-black text-orange-400">
              {topDish ? topDish.name : "-"}
            </div>
            <div className="mt-1 text-sm text-white/55">
              {topDish ? `${getViews(topDish.id)} views` : ""}
            </div>
          </div>
        </div>

        {adminNotice && (
          <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {adminNotice}
          </div>
        )}

        {showNewProductForm && (
          <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center gap-2 text-xl font-black">
              <PlusCircle className="h-5 w-5 text-emerald-300" />
              New Product Details
            </div>
            <p className="mb-4 text-sm text-white/60">
              Add a product for this browser session with category, pricing, thumbnail, and
              AR model path.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={newProduct.name}
                onChange={handleNewProductChange("name")}
                placeholder="Product name"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newProduct.id}
                onChange={handleNewProductChange("id")}
                placeholder="Unique ID (slug)"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newProduct.cat}
                onChange={handleNewProductChange("cat")}
                placeholder="Category (e.g. Mains)"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                min={1}
                value={newProduct.price}
                onChange={handleNewProductChange("price")}
                placeholder="Price (KSh)"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                value={newProduct.thumb}
                onChange={handleNewProductChange("thumb")}
                placeholder="Thumbnail URL/path (optional when uploading)"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none md:col-span-2"
              />
              <input
                key={`thumb-upload-${uploadKey}`}
                type="file"
                accept="image/*"
                onChange={(event) => setThumbFile(event.target.files?.[0] || null)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none md:col-span-2 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-400 file:px-3 file:py-1 file:text-xs file:font-bold file:text-black"
              />
              <input
                value={newProduct.model}
                onChange={handleNewProductChange("model")}
                placeholder="GLB URL/path (optional when uploading)"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none md:col-span-2"
              />
              <input
                key={`model-upload-${uploadKey}`}
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(event) => setModelFile(event.target.files?.[0] || null)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none md:col-span-2 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-3 file:py-1 file:text-xs file:font-bold file:text-black"
              />
              <textarea
                value={newProduct.desc}
                onChange={handleNewProductChange("desc")}
                placeholder="Description"
                rows={3}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none md:col-span-2"
              />
            </div>

            <p className="mt-3 text-xs text-white/55">
              You can either paste hosted paths or upload files directly. Uploaded assets are
              saved locally in this browser (IndexedDB).
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={addNewProduct}
                className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-300"
              >
                Add Product
              </button>
              {formError && <div className="text-sm text-red-300">{formError}</div>}
              {formSuccess && <div className="text-sm text-emerald-300">{formSuccess}</div>}
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
            Loading dashboard...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-white/[0.04]">
                  <tr className="text-left text-sm text-white/60">
                    <th className="px-4 py-4">Dish</th>
                    <th className="px-4 py-4">Category</th>
                    <th className="px-4 py-4">Base Price</th>
                    <th className="px-4 py-4">Override</th>
                    <th className="px-4 py-4">Views</th>
                    <th className="px-4 py-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dishes.map((dish) => (
                    <tr key={dish.id} className="border-t border-white/10">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={dish.thumb}
                            alt={dish.name}
                            className="h-12 w-12 rounded-2xl object-cover"
                            onError={(event) => {
                              const img = event.currentTarget;
                              if (img.dataset.fallbackApplied === "1") return;
                              img.dataset.fallbackApplied = "1";
                              img.src = LOGO_SRC;
                            }}
                          />
                          <div>
                            <div className="font-bold">
                              {dish.name}
                              {customIds.has(dish.id) && (
                                <span className="ml-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                  custom
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-white/45">{dish.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-white/70">{dish.cat}</td>
                      <td className="px-4 py-4 text-orange-400">{formatKsh(dish.price)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <PencilLine className="h-4 w-4 text-white/45" />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={overrideDrafts[dish.id] ?? ""}
                            onChange={(e) => updatePriceDraft(dish.id, e.target.value)}
                            placeholder={String(effectivePrice(dish))}
                            className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="inline-flex items-center gap-2 text-white/70">
                          <Eye className="h-4 w-4" />
                          {getViews(dish.id)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => navigate(`/ar?dish=${encodeURIComponent(dish.id)}`)}
                            disabled={!dish.model.trim()}
                            className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Open AR
                          </button>
                          {!dish.model.trim() && <div className="text-xs text-red-200">Missing model</div>}
                          {customIds.has(dish.id) && (
                            <button
                              onClick={() => removeCustomProduct(dish.id)}
                              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const dishesPath = path.join(repoRoot, "public", "data", "dishes.json");

function fail(message) {
  console.error(`Dishes validation failed: ${message}`);
  process.exitCode = 1;
}

let dishes;
try {
  dishes = JSON.parse(readFileSync(dishesPath, "utf8"));
} catch (error) {
  fail(`could not parse ${dishesPath}: ${error.message}`);
  process.exit();
}

if (!Array.isArray(dishes)) {
  fail("public/data/dishes.json must be an array");
  process.exit();
}

const seenIds = new Set();
const kebabIdRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kebabFileRe = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;

for (const [index, dish] of dishes.entries()) {
  const row = `index ${index}`;
  const id = typeof dish?.id === "string" ? dish.id.trim() : "";
  const category =
    typeof dish?.cat === "string" ? dish.cat.trim() : typeof dish?.category === "string" ? dish.category.trim() : "";
  const name = typeof dish?.name === "string" ? dish.name.trim() : "";
  const price = Number(dish?.price);
  const model = typeof dish?.model === "string" ? dish.model.trim() : "";
  const thumb = typeof dish?.thumb === "string" ? dish.thumb.trim() : "";

  if (!id) fail(`[${row}] missing required field: id`);
  if (!category) fail(`[${id || row}] missing required field: category (cat)`);
  if (!name) fail(`[${id || row}] missing required field: name`);
  if (!Number.isFinite(price) || price <= 0) fail(`[${id || row}] price must be a positive number`);
  if (!model) fail(`[${id || row}] missing required field: model`);
  if (!thumb) fail(`[${id || row}] missing required field: thumb`);
  if (id && !kebabIdRe.test(id)) {
    fail(`[${id}] id must be kebab-case (e.g. pasta-meatballs)`);
  }
  if (model) {
    const modelFile = model.replace(/^\/+/, "").split("/").pop() || "";
    if (!kebabFileRe.test(modelFile)) {
      fail(`[${id || row}] model filename must be kebab-case, got: ${model}`);
    }
  }
  if (thumb) {
    const thumbFile = thumb.replace(/^\/+/, "").split("/").pop() || "";
    if (!kebabFileRe.test(thumbFile)) {
      fail(`[${id || row}] thumb filename must be kebab-case, got: ${thumb}`);
    }
  }

  if (id) {
    if (seenIds.has(id)) fail(`[${id}] duplicate id`);
    seenIds.add(id);
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(`Dishes validation passed for ${dishes.length} dishes.`);

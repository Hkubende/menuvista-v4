import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const dishesPath = path.join(repoRoot, "public", "data", "dishes.json");

function fail(message) {
  console.error(`Asset validation failed: ${message}`);
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

for (const dish of dishes) {
  const id = dish?.id ?? "<missing-id>";
  for (const key of ["model", "thumb"]) {
    const raw = dish?.[key];
    if (typeof raw !== "string" || raw.trim() === "") {
      fail(`[${id}] ${key} must be a non-empty string`);
      continue;
    }

    if (/^(https?:|blob:|data:)/i.test(raw)) {
      fail(`[${id}] ${key} must reference a local file under public/, got external URL: ${raw}`);
      continue;
    }

    const normalized = raw.trim().replace(/^\/+/, "").replaceAll("/", path.sep);
    const fullPath = path.join(repoRoot, "public", normalized);
    if (!existsSync(fullPath)) {
      fail(`[${id}] missing ${key} file: ${raw}`);
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log(`Asset validation passed for ${dishes.length} dishes.`);

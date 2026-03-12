import process from "node:process";

const base = (process.env.STK_API_BASE || "https://menuvista-mpesa-backend.onrender.com").replace(/\/+$/, "");
const timeoutMs = Number(process.env.STK_TIMEOUT_MS || 15000);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const res = await fetch(`${base}/health`, {
    cache: "no-store",
    signal: controller.signal,
  });
  const body = await res.text();

  console.log(`Backend URL: ${base}`);
  console.log(`HTTP Status: ${res.status}`);
  console.log("Response Body:");
  console.log(body);

  if (!res.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.error(`Health check timed out after ${timeoutMs}ms: ${base}/health`);
  } else {
    console.error(`Health check failed: ${error?.message || error}`);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}

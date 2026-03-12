import process from "node:process";

const base = (process.env.STK_API_BASE || "https://menuvista-mpesa-backend.onrender.com").replace(/\/+$/, "");
const phone = process.env.STK_PHONE || "";
const amount = Number(process.env.STK_AMOUNT || 1);
const accountRef = (process.env.STK_REF || "MV4-ORDER").slice(0, 12);
const desc = (process.env.STK_DESC || "MenuVista MV4").slice(0, 40);
const timeoutMs = Number(process.env.STK_TIMEOUT_MS || 20000);

if (!phone) {
  console.error("Missing STK_PHONE. Example: STK_PHONE=0745123456");
  process.exit(1);
}

if (!Number.isFinite(amount) || amount < 1) {
  console.error("Invalid STK_AMOUNT. Use a positive number.");
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const res = await fetch(`${base}/stkpush`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      amount: Math.round(amount),
      accountRef,
      desc,
    }),
    signal: controller.signal,
  });
  const body = await res.json().catch(() => null);
  console.log(`Backend URL: ${base}`);
  console.log(`HTTP Status: ${res.status}`);
  console.log("STK Response:");
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok || !body?.ok) process.exitCode = 1;
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.error(`STK request timed out after ${timeoutMs}ms`);
  } else {
    console.error(`STK request failed: ${error?.message || error}`);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}

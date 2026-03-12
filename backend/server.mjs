import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const MPESA_ENV = (process.env.MPESA_ENV || "sandbox").toLowerCase();
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || "";
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || "";
const MPESA_SHORTCODE =
  process.env.MPESA_SHORTCODE ||
  process.env.MPESA_BUSINESS_SHORT_CODE ||
  process.env.MPESA_BIZ_NO ||
  "";
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || "";
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || "";
const MPESA_TRANSACTION_TYPE =
  process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline";
const MPESA_PARTY_B = process.env.MPESA_PARTY_B || MPESA_SHORTCODE;

const CALLBACKS = [];
const MAX_STORED_CALLBACKS = 30;

function nowIso() {
  return new Date().toISOString();
}

function resolveAllowedOrigin(reqOrigin) {
  if (CORS_ORIGIN.trim() === "*") return "*";
  const allowed = CORS_ORIGIN.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!reqOrigin) return allowed[0] || "*";
  return allowed.includes(reqOrigin) ? reqOrigin : allowed[0] || "*";
}

function withCorsHeaders(req, res) {
  const origin = resolveAllowedOrigin(req.headers.origin);
  res.setHeader("Access-Control-Allow-Origin", origin);
  if (origin !== "*") res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(req, res, statusCode, payload) {
  withCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getMpesaBaseUrl() {
  return MPESA_ENV === "production" || MPESA_ENV === "live"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  const secs = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${mins}${secs}`;
}

function maskPhone(phone) {
  return String(phone).replace(/^(\d{4})\d+(\d{2})$/, "$1******$2");
}

function requiredEnvMissing() {
  const missing = [];
  if (!MPESA_CONSUMER_KEY) missing.push("MPESA_CONSUMER_KEY");
  if (!MPESA_CONSUMER_SECRET) missing.push("MPESA_CONSUMER_SECRET");
  if (!MPESA_SHORTCODE) missing.push("MPESA_SHORTCODE");
  if (!MPESA_PASSKEY) missing.push("MPESA_PASSKEY");
  if (!MPESA_CALLBACK_URL) missing.push("MPESA_CALLBACK_URL");
  return missing;
}

function normalizePhoneKE(input) {
  const s = String(input || "").trim();
  if (/^07\d{8}$/.test(s)) return `254${s.slice(1)}`;
  if (/^2547\d{8}$/.test(s)) return s;
  if (/^\+2547\d{8}$/.test(s)) return s.slice(1);
  return null;
}

async function readJsonBody(req, maxBytes = 1024 * 32) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

async function fetchAccessToken() {
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString(
    "base64"
  );
  const url = `${getMpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    const details = body?.errorMessage || body?.error_description || "token fetch failed";
    throw new Error(`OAuth failed: ${details}`);
  }
  return body.access_token;
}

async function initiateStkPush({ phone, amount, accountRef, desc }) {
  const token = await fetchAccessToken();
  const timestamp = formatTimestamp();
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString(
    "base64"
  );

  const payload = {
    BusinessShortCode: MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: MPESA_TRANSACTION_TYPE,
    Amount: amount,
    PartyA: phone,
    PartyB: MPESA_PARTY_B,
    PhoneNumber: phone,
    CallBackURL: MPESA_CALLBACK_URL,
    AccountReference: accountRef,
    TransactionDesc: desc,
  };

  const url = `${getMpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const server = createServer(async (req, res) => {
  withCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const missing = requiredEnvMissing();
    sendJson(req, res, 200, {
      ok: true,
      service: "menuvista-mpesa-backend",
      env: MPESA_ENV,
      nodeEnv: NODE_ENV,
      configured: missing.length === 0,
      missing,
      time: nowIso(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/stkpush") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(req, res, 400, { ok: false, error: `Invalid JSON body: ${error.message}` });
      return;
    }

    const missing = requiredEnvMissing();
    if (missing.length) {
      sendJson(req, res, 503, {
        ok: false,
        error: "Backend not configured",
        missing,
      });
      return;
    }

    const phone = normalizePhoneKE(body.phone);
    const amount = Number(body.amount);
    const accountRef = String(body.accountRef || "MenuVista").trim().slice(0, 12);
    const desc = String(body.desc || "MenuVista Order").trim().slice(0, 40);

    if (!phone) {
      sendJson(req, res, 400, { ok: false, error: "Invalid Kenyan phone. Use 07XXXXXXXX." });
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) {
      sendJson(req, res, 400, { ok: false, error: "Amount must be a positive number." });
      return;
    }

    try {
      const mpesa = await initiateStkPush({
        phone,
        amount: Math.round(amount),
        accountRef,
        desc,
      });
      const responseCode = String(mpesa.body?.ResponseCode || "");
      const accepted = mpesa.status >= 200 && mpesa.status < 300 && responseCode === "0";

      sendJson(req, res, accepted ? 200 : 502, {
        ok: accepted,
        accepted,
        providerStatus: mpesa.status,
        responseCode,
        checkoutRequestId: mpesa.body?.CheckoutRequestID || null,
        merchantRequestId: mpesa.body?.MerchantRequestID || null,
        customerMessage: mpesa.body?.CustomerMessage || null,
        error:
          mpesa.body?.errorMessage ||
          mpesa.body?.ResponseDescription ||
          (accepted ? null : "STK request was not accepted by provider."),
        requestMeta: {
          phone: maskPhone(phone),
          amount: Math.round(amount),
          accountRef,
          env: MPESA_ENV,
        },
      });
    } catch (error) {
      sendJson(req, res, 502, {
        ok: false,
        error: error?.message || "Failed to call M-Pesa API",
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/callback") {
    let body;
    try {
      body = await readJsonBody(req, 1024 * 256);
    } catch {
      sendJson(req, res, 400, { ok: false, error: "Invalid callback payload" });
      return;
    }
    CALLBACKS.unshift({ time: nowIso(), body });
    while (CALLBACKS.length > MAX_STORED_CALLBACKS) CALLBACKS.pop();
    sendJson(req, res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/callbacks/latest") {
    sendJson(req, res, 200, { ok: true, count: CALLBACKS.length, items: CALLBACKS });
    return;
  }

  sendJson(req, res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(
    `[menuvista-mpesa-backend] listening on :${PORT} env=${MPESA_ENV} configured=${
      requiredEnvMissing().length === 0
    }`
  );
});

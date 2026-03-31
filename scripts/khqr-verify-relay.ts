import express from "express";

const app = express();
app.use(express.json());

const port = parsePositiveInteger(process.env.PORT, 8081);
const sharedSecret = requireEnv("KHQR_RELAY_SHARED_SECRET");
const sharedSecretHeader = String(
  process.env.KHQR_RELAY_SHARED_SECRET_HEADER ?? "x-khqr-verify-proxy-secret"
).trim().toLowerCase();
const bakongVerifyUrl = String(
  process.env.KHQR_RELAY_BAKONG_VERIFY_URL
  ?? "https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5"
).trim();
const bakongApiKey = requireEnv("KHQR_RELAY_BAKONG_API_KEY");
const bakongApiKeyHeader = String(
  process.env.KHQR_RELAY_BAKONG_API_KEY_HEADER ?? "authorization"
).trim();
const timeoutMs = parsePositiveInteger(process.env.KHQR_RELAY_TIMEOUT_MS, 5000);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "khqr-verify-relay",
    bakongVerifyUrl,
  });
});

app.post("/verify", async (req, res) => {
  const incomingSecret = resolveHeader(req.headers, sharedSecretHeader);
  if (!incomingSecret || incomingSecret !== sharedSecret) {
    res.status(401).json({
      success: false,
      error: "invalid relay secret",
    });
    return;
  }

  const md5 = typeof req.body?.md5 === "string" ? req.body.md5.trim() : "";
  if (!/^[a-fA-F0-9]{32}$/.test(md5)) {
    res.status(422).json({
      success: false,
      error: "md5 is required",
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    headers[bakongApiKeyHeader] = bakongApiKey.toLowerCase().startsWith("bearer ")
      ? bakongApiKey
      : `Bearer ${bakongApiKey}`;

    const upstream = await fetch(bakongVerifyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ md5 }),
      signal: controller.signal,
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.send(text);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "relay upstream request timed out"
        : error instanceof Error
          ? error.message
          : "relay upstream request failed";
    res.status(503).json({
      success: false,
      error: message,
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(port, () => {
  console.log(JSON.stringify({
    event: "khqr.verify.relay.started",
    port,
    sharedSecretHeader,
    bakongVerifyUrl,
    bakongApiKeyHeader,
    timeoutMs,
  }));
});

function requireEnv(key: string): string {
  const value = String(process.env[key] ?? "").trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const direct = headers[key];
  const lower = headers[key.toLowerCase()];
  const value = direct ?? lower;
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : null;
  }
  return typeof value === "string" ? value.trim() : null;
}

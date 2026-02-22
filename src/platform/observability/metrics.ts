type Labels = Record<string, string>;

type CounterSeries = {
  name: string;
  help: string;
  labels: Labels;
  value: number;
};

type GaugeSeries = {
  name: string;
  help: string;
  labels: Labels;
  value: number;
};

type HistogramSeries = {
  name: string;
  help: string;
  labels: Labels;
  buckets: number[];
  bucketCounts: number[];
  count: number;
  sum: number;
};

export type KhqrWebhookDiagnostics = {
  lastIgnoredReason: "NO_MATCH" | "AMBIGUOUS_MD5" | null;
  lastReceivedAt: string | null;
  lastAppliedAt: string | null;
  lastDuplicateAt: string | null;
  lastIgnoredAt: string | null;
  lastUnauthorizedAt: string | null;
  lastInvalidPayloadAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  totalReceived: number;
  totalApplied: number;
  totalDuplicate: number;
  totalIgnored: number;
  totalIgnoredNoMatch: number;
  totalIgnoredAmbiguousMd5: number;
  totalUnauthorized: number;
  totalInvalidPayload: number;
  totalFailed: number;
};

const counters = new Map<string, CounterSeries>();
const gauges = new Map<string, GaugeSeries>();
const histograms = new Map<string, HistogramSeries>();
const khqrWebhookDiagnostics: KhqrWebhookDiagnostics = {
  lastIgnoredReason: null,
  lastReceivedAt: null,
  lastAppliedAt: null,
  lastDuplicateAt: null,
  lastIgnoredAt: null,
  lastUnauthorizedAt: null,
  lastInvalidPayloadAt: null,
  lastFailedAt: null,
  lastError: null,
  totalReceived: 0,
  totalApplied: 0,
  totalDuplicate: 0,
  totalIgnored: 0,
  totalIgnoredNoMatch: 0,
  totalIgnoredAmbiguousMd5: 0,
  totalUnauthorized: 0,
  totalInvalidPayload: 0,
  totalFailed: 0,
};

const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

function toKey(name: string, labels: Labels): string {
  const normalized = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return `${name}|${normalized.map(([k, v]) => `${k}=${v}`).join(",")}`;
}

function sanitizeLabelValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, 120)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function normalizeLabels(labels: Record<string, unknown>): Labels {
  const out: Labels = {};
  for (const [key, value] of Object.entries(labels)) {
    out[key] = sanitizeLabelValue(value);
  }
  return out;
}

function incCounter(name: string, help: string, labels: Labels, by = 1): void {
  const key = toKey(name, labels);
  const current = counters.get(key);
  if (current) {
    current.value += by;
    return;
  }
  counters.set(key, {
    name,
    help,
    labels,
    value: by,
  });
}

function setGauge(name: string, help: string, labels: Labels, value: number): void {
  const key = toKey(name, labels);
  const current = gauges.get(key);
  if (current) {
    current.value = value;
    return;
  }
  gauges.set(key, {
    name,
    help,
    labels,
    value,
  });
}

function observeHistogram(
  name: string,
  help: string,
  labels: Labels,
  value: number,
  buckets = DURATION_BUCKETS_MS
): void {
  const key = toKey(name, labels);
  const current = histograms.get(key);
  const series =
    current ??
    ({
      name,
      help,
      labels,
      buckets: [...buckets],
      bucketCounts: new Array(buckets.length).fill(0),
      count: 0,
      sum: 0,
    } satisfies HistogramSeries);

  series.count += 1;
  series.sum += value;
  for (let i = 0; i < series.buckets.length; i += 1) {
    if (value <= series.buckets[i]) {
      series.bucketCounts[i] += 1;
    }
  }
  if (!current) {
    histograms.set(key, series);
  }
}

function labelsToProm(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

function routeLabel(route: string): string {
  return route || "/";
}

export function recordHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): void {
  const labels = normalizeLabels({
    method: input.method.toUpperCase(),
    route: routeLabel(input.route),
    status: String(input.statusCode),
  });

  incCounter("http_requests_total", "Total HTTP requests", labels, 1);
  observeHistogram(
    "http_request_duration_ms",
    "HTTP request duration in milliseconds",
    normalizeLabels({
      method: input.method.toUpperCase(),
      route: routeLabel(input.route),
    }),
    input.durationMs
  );
}

export function recordHttpRequestError(input: {
  method: string;
  route: string;
  errorCode: string;
}): void {
  incCounter(
    "http_request_errors_total",
    "Total HTTP request errors",
    normalizeLabels({
      method: input.method.toUpperCase(),
      route: routeLabel(input.route),
      error_code: input.errorCode,
    }),
    1
  );
}

export function recordDbTransaction(input: {
  result: "committed" | "rolled_back";
  durationMs: number;
  actionKey?: string;
}): void {
  incCounter(
    "db_transactions_total",
    "Total DB transactions",
    normalizeLabels({ result: input.result }),
    1
  );
  observeHistogram(
    "db_transaction_duration_ms",
    "DB transaction duration in milliseconds",
    normalizeLabels({ action_key: input.actionKey ?? "-" }),
    input.durationMs
  );
}

export function recordOutboxEventProcessed(input: {
  eventType: string;
  result: "published" | "failed";
  durationMs: number;
}): void {
  incCounter(
    "outbox_events_processed_total",
    "Total processed outbox events",
    normalizeLabels({
      event_type: input.eventType,
      result: input.result,
    }),
    1
  );
  observeHistogram(
    "outbox_dispatch_duration_ms",
    "Outbox dispatch duration in milliseconds",
    normalizeLabels({ event_type: input.eventType }),
    input.durationMs
  );
}

export function setOutboxBacklogCount(count: number): void {
  setGauge("outbox_backlog_count", "Current outbox backlog count", {}, count);
}

export function recordKhqrWebhookEvent(input: {
  outcome:
    | "received"
    | "applied"
    | "duplicate"
    | "ignored"
    | "unauthorized"
    | "invalid_payload"
    | "failed";
  errorCode?: string | null;
  ignoredReason?: "NO_MATCH" | "AMBIGUOUS_MD5" | null;
}): void {
  const now = new Date().toISOString();
  const labels =
    input.outcome === "ignored"
      ? normalizeLabels({
          outcome: input.outcome,
          ignored_reason: input.ignoredReason ?? "NO_MATCH",
        })
      : normalizeLabels({ outcome: input.outcome });
  incCounter(
    "khqr_webhook_events_total",
    "Total KHQR webhook events processed by outcome",
    labels,
    1
  );

  switch (input.outcome) {
    case "received":
      khqrWebhookDiagnostics.totalReceived += 1;
      khqrWebhookDiagnostics.lastReceivedAt = now;
      return;
    case "applied":
      khqrWebhookDiagnostics.totalApplied += 1;
      khqrWebhookDiagnostics.lastAppliedAt = now;
      return;
    case "duplicate":
      khqrWebhookDiagnostics.totalDuplicate += 1;
      khqrWebhookDiagnostics.lastDuplicateAt = now;
      return;
    case "ignored":
      khqrWebhookDiagnostics.lastIgnoredReason = input.ignoredReason ?? "NO_MATCH";
      khqrWebhookDiagnostics.totalIgnored += 1;
      khqrWebhookDiagnostics.lastIgnoredAt = now;
      if ((input.ignoredReason ?? "NO_MATCH") === "AMBIGUOUS_MD5") {
        khqrWebhookDiagnostics.totalIgnoredAmbiguousMd5 += 1;
      } else {
        khqrWebhookDiagnostics.totalIgnoredNoMatch += 1;
      }
      return;
    case "unauthorized":
      khqrWebhookDiagnostics.totalUnauthorized += 1;
      khqrWebhookDiagnostics.lastUnauthorizedAt = now;
      khqrWebhookDiagnostics.lastError = input.errorCode ?? "KHQR_WEBHOOK_UNAUTHORIZED";
      return;
    case "invalid_payload":
      khqrWebhookDiagnostics.totalInvalidPayload += 1;
      khqrWebhookDiagnostics.lastInvalidPayloadAt = now;
      khqrWebhookDiagnostics.lastError = input.errorCode ?? "KHQR_WEBHOOK_PAYLOAD_INVALID";
      return;
    case "failed":
      khqrWebhookDiagnostics.totalFailed += 1;
      khqrWebhookDiagnostics.lastFailedAt = now;
      khqrWebhookDiagnostics.lastError = input.errorCode ?? "KHQR_WEBHOOK_INGEST_FAILED";
      return;
    default:
      return;
  }
}

export function getKhqrWebhookDiagnostics(): KhqrWebhookDiagnostics {
  return { ...khqrWebhookDiagnostics };
}

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  const seenMetricTypes = new Set<string>();

  for (const entry of counters.values()) {
    if (!seenMetricTypes.has(entry.name)) {
      lines.push(`# HELP ${entry.name} ${entry.help}`);
      lines.push(`# TYPE ${entry.name} counter`);
      seenMetricTypes.add(entry.name);
    }
    lines.push(`${entry.name}${labelsToProm(entry.labels)} ${entry.value}`);
  }

  for (const entry of gauges.values()) {
    if (!seenMetricTypes.has(entry.name)) {
      lines.push(`# HELP ${entry.name} ${entry.help}`);
      lines.push(`# TYPE ${entry.name} gauge`);
      seenMetricTypes.add(entry.name);
    }
    lines.push(`${entry.name}${labelsToProm(entry.labels)} ${entry.value}`);
  }

  for (const entry of histograms.values()) {
    if (!seenMetricTypes.has(entry.name)) {
      lines.push(`# HELP ${entry.name} ${entry.help}`);
      lines.push(`# TYPE ${entry.name} histogram`);
      seenMetricTypes.add(entry.name);
    }

    const baseLabels = entry.labels;
    for (let i = 0; i < entry.buckets.length; i += 1) {
      const withLe = { ...baseLabels, le: String(entry.buckets[i]) };
      lines.push(
        `${entry.name}_bucket${labelsToProm(withLe)} ${entry.bucketCounts[i]}`
      );
    }
    lines.push(
      `${entry.name}_bucket${labelsToProm({ ...baseLabels, le: "+Inf" })} ${entry.count}`
    );
    lines.push(`${entry.name}_sum${labelsToProm(baseLabels)} ${entry.sum}`);
    lines.push(`${entry.name}_count${labelsToProm(baseLabels)} ${entry.count}`);
  }

  return `${lines.join("\n")}\n`;
}

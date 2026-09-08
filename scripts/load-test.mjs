const target = process.env.LOAD_TEST_URL || "http://127.0.0.1:3001/api/health";
const requests = Math.max(1, Number(process.env.LOAD_TEST_REQUESTS || 1000));
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 25));
const timeoutMs = Math.max(500, Number(process.env.LOAD_TEST_TIMEOUT_MS || 10000));
const latencies = [];
const statuses = new Map();
let cursor = 0;

async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    let status = "network_error";
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      status = String(response.status);
      await response.arrayBuffer();
    } catch { /* contabilizado como erro de rede */ }
    latencies.push(performance.now() - started);
    statuses.set(status, (statuses.get(status) || 0) + 1);
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
const elapsedMs = performance.now() - started;
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)];
const success = [...statuses.entries()].filter(([status]) => /^2\d\d$/.test(status)).reduce((sum, [, count]) => sum + count, 0);

console.log(JSON.stringify({ target, requests, concurrency, elapsedSeconds: +(elapsedMs / 1000).toFixed(2), requestsPerSecond: +(requests / (elapsedMs / 1000)).toFixed(1), successRate: +(success / requests * 100).toFixed(2), latencyMs: { p50: +percentile(.5).toFixed(1), p95: +percentile(.95).toFixed(1), p99: +percentile(.99).toFixed(1), max: +latencies.at(-1).toFixed(1) }, statuses: Object.fromEntries(statuses) }, null, 2));
if (success !== requests) process.exitCode = 1;

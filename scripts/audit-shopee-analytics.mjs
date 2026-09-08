import "dotenv/config";
import { createDecipheriv, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await db
  .from("affiliate_accounts")
  .select("encrypted_credentials")
  .eq("platform", "shopee")
  .eq("status", "configured")
  .eq("validation_status", "valid")
  .not("encrypted_credentials", "is", null)
  .limit(1)
  .maybeSingle();
if (error) throw error;
if (!data) {
  console.log(JSON.stringify({ configured: false }));
  process.exit(0);
}

const envelope = data.encrypted_credentials;
const rawKey = process.env.AFFILIATE_CREDENTIALS_ENCRYPTION_KEY ?? "";
const key = /^[a-f\d]{64}$/iu.test(rawKey)
  ? Buffer.from(rawKey, "hex") : Buffer.from(rawKey, "base64");
const decipher = createDecipheriv(
  "aes-256-gcm",
  key,
  Buffer.from(envelope.iv, "base64"),
);
decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
const credentials = JSON.parse(Buffer.concat([
  decipher.update(Buffer.from(envelope.data, "base64")),
  decipher.final(),
]).toString("utf8"));

const end = Math.floor(Date.now() / 1_000);
const days = Math.min(90, Math.max(1, Number(process.env.SHOPEE_AUDIT_DAYS ?? 1)));
const start = end - days * 86_400;
const query = `{ conversionReport(purchaseTimeStart:${start}, purchaseTimeEnd:${end}, limit:1) { nodes { conversionId purchaseTime clickTime totalCommission utmContent orders { orderId orderStatus items { itemId itemName itemPrice qty itemTotalCommission attributionType } } } pageInfo { limit hasNextPage scrollId } } }`;
const body = JSON.stringify({ query });
const timestamp = Math.floor(Date.now() / 1_000);
const signature = createHash("sha256")
  .update(`${credentials.appId}${timestamp}${body}${credentials.secret}`)
  .digest("hex");
const response = await fetch(
  process.env.SHOPEE_AFFILIATE_API_URL ??
    "https://open-api.affiliate.shopee.com.br/graphql",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `SHA256 Credential=${credentials.appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body,
  },
);
const payload = await response.json();
const report = payload?.data?.conversionReport;
const node = report?.nodes?.[0];

// Saída deliberadamente estrutural: nunca imprime IDs, valores ou credenciais.
console.log(JSON.stringify({
  configured: true,
  httpStatus: response.status,
  errorCodes: (payload?.errors ?? []).map((item) =>
    item?.extensions?.code ?? null),
  errorMessages: (payload?.errors ?? []).map((item) =>
    String(item?.message ?? item?.extensions?.message ?? "").slice(0, 180)),
  nodeCount: Array.isArray(report?.nodes) ? report.nodes.length : null,
  nodeFields: node ? Object.keys(node) : [],
  orderFields: node?.orders?.[0] ? Object.keys(node.orders[0]) : [],
  itemFields: node?.orders?.[0]?.items?.[0]
    ? Object.keys(node.orders[0].items[0]) : [],
  hasUtmContent: Boolean(node?.utmContent),
  orderStatuses: [...new Set((node?.orders ?? []).map((item) =>
    item.orderStatus))],
  pageInfoFields: report?.pageInfo ? Object.keys(report.pageInfo) : [],
}));

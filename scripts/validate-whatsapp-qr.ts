import "dotenv/config";
import { getSupabaseAdmin } from "../src/backend/supabaseBackend";
import { SupabaseWhatsAppRepository } from "../src/backend/whatsapp/SupabaseWhatsAppRepository";
import { WhatsAppConnectionManager } from "../src/backend/whatsapp/WhatsAppConnectionManager";
import { whatsAppEventBus } from "../src/backend/whatsapp/eventBus";

const db = getSupabaseAdmin();
if (!db) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");

const { data: owner, error: ownerError } = await db
  .from("whatsapp_connections")
  .select("user_id")
  .limit(1)
  .single();
if (ownerError || !owner?.user_id) throw new Error("QR_TEST_OWNER_NOT_FOUND");

const repository = new SupabaseWhatsAppRepository(db);
const manager = new WhatsAppConnectionManager(repository);
const connection = await repository.createConnection(
  owner.user_id,
  `validação-qr-${Date.now()}`,
);
let unsubscribe = () => undefined;

try {
  const waitForQr = () =>
    new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("QR_TEST_TIMEOUT")),
        30_000,
      );
      unsubscribe();
      unsubscribe = whatsAppEventBus.subscribe(owner.user_id, (event) => {
        if (
          event.type === "qr.updated" &&
          event.connectionId === connection.id &&
          event.data.qr
        ) {
          clearTimeout(timeout);
          resolve(event.data.qr);
        }
      });
    });

  const connected = await manager.connect(connection);
  if (!connected.success) throw new Error(connected.error.code);
  const firstQr = await waitForQr();
  if (firstQr.length < 100) throw new Error("QR_TEST_INVALID_PAYLOAD");
  await manager.disconnect(connection.id);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const reconnected = await manager.connect(connection);
  if (!reconnected.success) throw new Error(reconnected.error.code);
  const secondQr = await waitForQr();
  if (secondQr.length < 100)
    throw new Error("QR_RECONNECT_TEST_INVALID_PAYLOAD");
  console.log(
    `QR_LOCAL_CYCLE_VALIDATED first=${firstQr.length} second=${secondQr.length}`,
  );
} finally {
  unsubscribe();
  await manager.remove(connection.id).catch(() => undefined);
  await repository.deleteSession(connection.id).catch(() => undefined);
  await repository.deleteConnection(connection.id).catch(() => undefined);
}

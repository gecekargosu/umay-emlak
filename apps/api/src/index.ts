/** API giriş noktası. Tek komut: pnpm dev */
import { serve } from "@hono/node-server";
import { loadEnv, closePool } from "@umay/db";
import { app } from "./app.js";

loadEnv();

const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`UMAY EMLAK API — http://localhost:${info.port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log("geçici oturum: x-dev-email başlığı (Dilim 1'de gerçek giriş)");
  }
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} alındı, kapatılıyor...`);
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

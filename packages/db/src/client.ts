/**
 * Veritabanı istemcisi.
 *
 * K-07 · Kiracı izolasyonu iki katman:
 *   1) Birincil: her sorgu withTenant() içinden geçer (repository kuralı).
 *   2) İkinci ağ: PostgreSQL RLS. Uygulama rolü (umay_app) süper kullanıcı
 *      DEĞİLDİR, bu yüzden RLS gerçekten uygulanır. Bağlam yoksa 0 satır döner.
 *
 * set_config(..., true) işlem-yereldir: bağlantı havuza dönerken tenant
 * bağlamı taşınmaz. Bu, havuz kaynaklı kiracı sızıntısını engeller.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { loadEnv, requireEnv } from "./env.js";
import * as schema from "./schema.js";

loadEnv();

export type Db = NodePgDatabase<typeof schema>;

let poolInstance: Pool | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return poolInstance;
}

export function getDb(): Db {
  return drizzle(getPool(), { schema });
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Kiracı bağlamında işlem çalıştırır.
 * Tenant kimliği ASLA istemciden alınmaz; oturumdan gelir (routes katmanı).
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Geçersiz kiracı kimliği");
  }
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Yerel (transaction-scoped) bağlam — havuzda kalıntı bırakmaz
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const tx = drizzle(client, { schema }) as unknown as Tx;
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Test ve kapanış için. */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

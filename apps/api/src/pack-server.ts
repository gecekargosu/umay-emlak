/**
 * Taşınabilir paket sunucusu — TUR:34 (Y-89).
 *
 * Aysan'ın bilgisayarında kurulum gerektirmemesi için her şey tek klasörde:
 * gömülü PostgreSQL (veri klasörü yanında), Node çalışma zamanı, API + arayüz.
 * İlk çalıştırmada şema kurulur, demo ofis ve demo portföy tohumlanır.
 *
 * Sırlar yalnız yerel `veri/` klasöründe üretilir; pakete gömülü parola yok.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { app } from "./app.js";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
process.chdir(APP_DIR);

const DATA_ROOT = join(APP_DIR, "..", "veri");
const PG_DIR = join(DATA_ROOT, "db");
const DOC_DIR = join(DATA_ROOT, "belgeler");
const PG_PORT = 55432;
const PG_SUPER_PASSWORD = "umay_yerel_pg";
const APP_DB_PASSWORD = "umay_yerel_app";
const APP_PORT = Number(process.env.API_PORT ?? 3100);

mkdirSync(DATA_ROOT, { recursive: true });
mkdirSync(DOC_DIR, { recursive: true });

function secretOnce(name: string): string {
  const file = join(DATA_ROOT, name);
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const value = randomBytes(32).toString("hex");
  writeFileSync(file, value, "utf8");
  return value;
}

function log(message: string): void {
  console.log(`[UMAY] ${message}`);
}

const pg = new EmbeddedPostgres({
  databaseDir: PG_DIR,
  user: "postgres",
  password: PG_SUPER_PASSWORD,
  port: PG_PORT,
  persistent: true,
  initdbFlags: ["--locale=C", "--encoding=UTF8"],
});

async function startDatabase(): Promise<void> {
  if (!existsSync(join(PG_DIR, "PG_VERSION"))) {
    log("veritabanı ilk kez hazırlanıyor (birkaç dakika sürebilir)…");
    await pg.initialise();
  }
  await pg.start();
  log("veritabanı açıldı");
}

async function ensureRoleAndDb(): Promise<void> {
  const admin = pg.getPgClient("postgres");
  await admin.connect();
  try {
    await admin.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'umay_app') then
          create role umay_app login password '${APP_DB_PASSWORD}';
        end if;
      end $$;
    `);
    const exists = await admin.query("select 1 from pg_database where datname = 'umay_dev'");
    if (exists.rowCount === 0) {
      await pg.createDatabase("umay_dev");
      log("uygulama veritabanı oluşturuldu");
    }
  } finally {
    await admin.end();
  }
}

async function runMigrations(): Promise<void> {
  const client = new Client({
    connectionString: `postgres://postgres:${PG_SUPER_PASSWORD}@127.0.0.1:${PG_PORT}/umay_dev`,
  });
  await client.connect();
  try {
    await client.query(`
      create table if not exists _migration (
        name       text primary key,
        applied_at timestamptz not null default now()
      );
    `);
    const applied = new Set(
      (await client.query<{ name: string }>("select name from _migration")).rows.map((r) => r.name),
    );
    const dir = join(APP_DIR, "migrations");
    const files = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      process.stdout.write(`[UMAY] şema: ${file} … `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migration (name) values ($1)", [file]);
        await client.query("commit");
        ran += 1;
        console.log("tamam");
      } catch (error) {
        await client.query("rollback");
        console.log("HATA");
        throw error;
      }
    }

    await client.query("grant usage on schema public to umay_app");
    await client.query(
      "grant select, insert, update, delete on all tables in schema public to umay_app",
    );
    await client.query("grant usage, select on all sequences in schema public to umay_app");
    await client.query(
      "alter default privileges in schema public grant select, insert, update, delete on tables to umay_app",
    );
    await client.query("grant execute on function auth_lookup(text) to umay_app");
    log(`şema hazır (${ran} yeni dosya, ${files.length} toplam)`);
  } finally {
    await client.end();
  }
}

function runNode(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(APP_DIR, script), ...args], {
      cwd: APP_DIR,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} başarısız (kod ${code})`)),
    );
    child.on("error", reject);
  });
}

async function seedIfEmpty(): Promise<void> {
  const client = new Client({
    connectionString: `postgres://postgres:${PG_SUPER_PASSWORD}@127.0.0.1:${PG_PORT}/umay_dev`,
  });
  await client.connect();
  let empty = false;
  try {
    const { rows } = await client.query<{ n: string }>("select count(*)::text as n from tenant");
    empty = Number(rows[0]?.n ?? "0") === 0;
  } finally {
    await client.end();
  }
  if (!empty) return;

  log("ilk kurulum: ofis, kullanıcı ve demo portföy hazırlanıyor…");
  await runNode("seed.mjs");
  await runNode("demo.mjs", ["seed"]);
  log("demo veri hazır");
}

async function main(): Promise<void> {
  await startDatabase();
  await ensureRoleAndDb();

  process.env.MIGRATE_DATABASE_URL = `postgres://postgres:${PG_SUPER_PASSWORD}@127.0.0.1:${PG_PORT}/umay_dev`;
  process.env.DATABASE_URL = `postgres://umay_app:${APP_DB_PASSWORD}@127.0.0.1:${PG_PORT}/umay_dev`;
  process.env.APP_DB_PASSWORD = APP_DB_PASSWORD;
  process.env.SESSION_SECRET = secretOnce("oturum-anahtari.txt");
  process.env.UMAY_STORAGE_DIR = DOC_DIR;
  process.env.API_PORT = String(APP_PORT);
  process.env.NODE_ENV = "development";

  await runMigrations();
  await seedIfEmpty();

  const web = new Hono();
  web.use("/*", serveStatic({ root: "./public" }));
  web.route("/", app);
  web.get("*", serveStatic({ path: "./public/index.html" }));

  const server = serve({ fetch: web.fetch, port: APP_PORT }, (info) => {
    const url = `http://localhost:${info.port}`;
    log(`hazır: ${url}`);
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    }
  });

  const shutdown = async () => {
    server.close();
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[UMAY] başlatılamadı:", error);
  console.error("[UMAY] Bu pencereyi kapatıp tekrar deneyin; sorun sürerse logu gönderin.");
  process.exit(1);
});

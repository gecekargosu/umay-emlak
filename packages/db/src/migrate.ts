/**
 * Migration çalıştırıcı.
 * Sıra önemli: 1) uygulama rolü, 2) SQL dosyaları, 3) tablo yetkileri.
 * Şema sahibi bağlantısı MIGRATE_DATABASE_URL'den gelir; uygulama rolü
 * (umay_app) süper kullanıcı DEĞİLDİR, böylece RLS gerçekten uygulanır.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { APP_DB_ROLE, loadEnv, requireEnv } from "./env.js";

loadEnv();

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

async function main(): Promise<void> {
  const client = new Client({ connectionString: requireEnv("MIGRATE_DATABASE_URL") });
  await client.connect();

  try {
    // 1) Uygulama rolü (RLS bu role uygulanır)
    const password = process.env.APP_DB_PASSWORD ?? "umay_app_local";
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${APP_DB_ROLE}') then
          create role ${APP_DB_ROLE} login;
        end if;
      end $$;
    `);
    await client.query(
      `alter role ${APP_DB_ROLE} with login password ${client.escapeLiteral(password)}`,
    );
    console.log(`rol hazır: ${APP_DB_ROLE}`);

    // 2) Migration defteri
    await client.query(`
      create table if not exists _migration (
        name       text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Set(
      (await client.query<{ name: string }>("select name from _migration")).rows.map(
        (r) => r.name,
      ),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`atlandı (zaten uygulandı): ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`uygulanıyor: ${file} ... `);
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

    // 3) Uygulama rolünün tablo yetkileri (RLS satırları yine filtreler)
    await client.query(`grant usage on schema public to ${APP_DB_ROLE}`);
    await client.query(
      `grant select, insert, update, delete on all tables in schema public to ${APP_DB_ROLE}`,
    );
    await client.query(`grant usage, select on all sequences in schema public to ${APP_DB_ROLE}`);
    await client.query(
      `alter default privileges in schema public
         grant select, insert, update, delete on tables to ${APP_DB_ROLE}`,
    );
    await client.query(`grant execute on function auth_lookup(text) to ${APP_DB_ROLE}`);

    console.log(`\nbitti: ${ran} yeni migration uygulandı, ${files.length} dosya toplam.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("migration başarısız:", error);
  process.exit(1);
});

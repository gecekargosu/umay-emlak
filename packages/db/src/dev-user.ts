/**
 * GELİŞTİRME ARACI — yerel kullanıcı oluşturur veya şifresini tazeler.
 *
 * Kullanım:
 *   pnpm db:user <e-posta> <şifre> [rol] [ofis-slug] ["Ad Soyad"]
 *
 * Neden var: pilot ofiste programı denemek isteyen herkese tek tek SQL
 * yazdırmamak için. Üretimde kullanılmaz; şifre komut satırında görünür,
 * bu yüzden yalnız geliştirme makinesinde çalıştırılır.
 *
 * Şema sahibiyle bağlanır: RLS'i aşar (kullanıcı/üyelik yazmak için gerekli).
 */
import { Client } from "pg";
import { hashPassword } from "./auth.js";
import { loadEnv, requireEnv } from "./env.js";

loadEnv();

const [emailArg, passwordArg, roleArg = "owner", slugArg = "umay-emlak", nameArg] =
  process.argv.slice(2);

if (!emailArg || !passwordArg) {
  console.error('kullanım: pnpm db:user <e-posta> <şifre> [rol] [ofis-slug] ["Ad Soyad"]');
  process.exit(1);
}

const VALID_ROLES = ["owner", "partner", "manager", "agent", "finance", "viewer"];
if (!VALID_ROLES.includes(roleArg)) {
  console.error(`geçersiz rol: ${roleArg} (${VALID_ROLES.join(", ")})`);
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const password: string = passwordArg;
const fullName = (nameArg ?? email.split("@")[0] ?? "Kullanıcı").trim();
const canApprove = roleArg === "owner" || roleArg === "partner";

async function main(): Promise<void> {
  const client = new Client({ connectionString: requireEnv("MIGRATE_DATABASE_URL") });
  await client.connect();

  try {
    const tenant = await client.query<{ id: string; name: string }>(
      "select id, name from tenant where slug = $1",
      [slugArg],
    );
    if (!tenant.rows[0]) {
      throw new Error(`ofis bulunamadı: ${slugArg} (önce pnpm db:seed)`);
    }
    const tenantId = tenant.rows[0].id;

    const user = await client.query<{ id: string }>(
      `insert into app_user (email, full_name, password_hash, must_change_password)
         values ($1, $2, $3, false)
         on conflict (email) do update
           set full_name = excluded.full_name,
               password_hash = excluded.password_hash,
               must_change_password = false
         returning id`,
      [email, fullName, hashPassword(password)],
    );
    const userId = user.rows[0]!.id;

    await client.query(
      `insert into membership (tenant_id, user_id, role, status, can_approve)
         values ($1, $2, $3, 'active', $4)
         on conflict (tenant_id, user_id) do update
           set role = excluded.role,
               status = 'active',
               can_approve = excluded.can_approve`,
      [tenantId, userId, roleArg, canApprove],
    );

    console.log(`hazır: ${email} → ${tenant.rows[0].name} (${roleArg}, onay: ${canApprove ? "var" : "yok"})`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("kullanıcı oluşturulamadı:", error instanceof Error ? error.message : error);
  process.exit(1);
});

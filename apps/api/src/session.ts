/**
 * Oturum çözümleme — DİLİM 0 GEÇİCİ.
 * Şu an giriş yok: istemci `x-dev-email` başlığı gönderir ve o e-postanın
 * hangi ofiste hangi rolde olduğu veritabanından okunur. Şifre/2FA/oturum
 * çerezi Dilim 1'de gelecek. Bu yüzden bu dosya "login" sayılmaz; üretime
 * bu haliyle çıkmaz ve NODE_ENV=production'da çalışmayı reddeder.
 */
import type { Context } from "hono";
import { getPool } from "@umay/db";

export type Session = {
  userId: string;
  tenantId: string;
  role: "owner" | "partner" | "manager" | "agent" | "finance" | "viewer";
  canApprove: boolean;
  fullName: string;
  tenantName: string;
};

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export async function resolveSession(c: Context): Promise<Session> {
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(401, "Geçici geliştirme oturumu üretimde kapalıdır (Dilim 1 bekleniyor)");
  }

  const email = c.req.header("x-dev-email");
  if (!email) {
    throw new HttpError(401, "Oturum yok: x-dev-email başlığı gerekli (geçici)");
  }

  const { rows } = await getPool().query<{
    user_id: string;
    tenant_id: string;
    role: Session["role"];
    can_approve: boolean;
    full_name: string;
    tenant_name: string;
    tenant_status: "active" | "suspended";
  }>("select * from auth_lookup($1)", [email]);

  const row = rows[0];
  if (!row) throw new HttpError(401, "Bu e-posta hiçbir ofiste üye değil");

  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    role: row.role,
    canApprove: row.can_approve,
    fullName: row.full_name,
    tenantName: row.tenant_name,
  };
}

/** K-29: onay yetkisi olmayan işlemi reddeder. */
export function requireApproval(session: Session, action: string): void {
  if (!session.canApprove) {
    throw new HttpError(403, `Bu işlem onay yetkisi ister: ${action}`);
  }
}

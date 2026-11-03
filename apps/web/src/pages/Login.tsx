import { useState } from "react";
import { api, ApiError, type Session } from "../api";

type TenantChoice = { id: string; name: string };

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tenants, setTenants] = useState<TenantChoice[] | null>(null);

  async function submit(tenantId?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ needsTenant?: boolean; tenants?: TenantChoice[] }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password, ...(tenantId ? { tenantId } : {}) }),
        },
      );

      if (result.needsTenant && result.tenants) {
        setTenants(result.tenants);
        return;
      }

      const session = await api<Session>("/auth/session");
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Giriş yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <img src="/brand/tm-dark.jpeg" alt="TM Gayrimenkul" className="login-logo" />
        <h1>UMAY EMLAK</h1>
        <p className="muted">Gayrimenkul yönetim programı · TM Gayrimenkul</p>

        <label>
          E-posta
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Şifre
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <div className="error">{error}</div>}

        {tenants && (
          <div className="tenant-picker">
            <p className="muted">Hangi ofiste çalışacaksınız?</p>
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                className="secondary"
                onClick={() => void submit(tenant.id)}
              >
                {tenant.name}
              </button>
            ))}
          </div>
        )}

        <button type="submit" disabled={busy || tenants !== null}>
          {busy ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>

        <p className="hint">
          Geliştirme hesabı: aysan.kilic@umay-emlak.local / Umay!2026
        </p>
      </form>
    </div>
  );
}

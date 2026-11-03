import { useState } from "react";
import { api, ApiError, type Session } from "../api";

/**
 * Y-02: şifre değiştirme ekranı.
 * Geçici şifreyle açılan hesap (mustChangePassword) veri uçlarında 403 alır;
 * bu ekran olmadan ekip daveti fiilen kullanılamıyordu.
 * Şifre değişince diğer cihazlardaki oturumlar kapanır, bu cihaz açık kalır.
 */
export function PasswordChange({
  name,
  email,
  forced = false,
  onDone,
  onClose,
  onLogout,
}: {
  name: string;
  email: string;
  forced?: boolean;
  onDone: (session: Session) => void;
  onClose?: () => void;
  onLogout?: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Yeni şifre en az 8 karakter olmalı.");
      return;
    }
    if (newPassword !== repeat) {
      setError("Yeni şifreler birbirini tutmuyor.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Yeni şifre eskisinden farklı olmalı.");
      return;
    }

    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const session = await api<Session>("/auth/session");
      onDone(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Şifre değiştirilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>
          ŞİFRE <span>DEĞİŞTİR</span>
        </h1>
        <p className="muted small">
          {name} · {email}
        </p>

        {forced && (
          <p className="alert" style={{ marginTop: 10 }}>
            Geçici şifreyle girdiniz. Devam etmek için kendi şifrenizi belirlemelisiniz. Kaydettikten
            sonra diğer cihazlardaki oturumlarınız kapanır, bu cihaz açık kalır.
          </p>
        )}

        <label>
          Mevcut şifre
          <input
            type="password"
            value={currentPassword}
            autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>

        <label>
          Yeni şifre (en az 8 karakter)
          <input
            type="password"
            value={newPassword}
            autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </label>

        <label>
          Yeni şifre (tekrar)
          <input
            type="password"
            value={repeat}
            autoComplete="new-password"
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={busy || !currentPassword || !newPassword || !repeat}>
          {busy ? "Kaydediliyor…" : "Şifreyi kaydet"}
        </button>

        {!forced && onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            Vazgeç
          </button>
        )}

        {forced && onLogout && (
          <button type="button" className="ghost" onClick={onLogout}>
            Çıkış yap
          </button>
        )}

        <p className="hint">
          Şifre sunucuda scrypt ile saklanır; program şifrenizi düz metin olarak tutmaz.
        </p>
      </form>
    </div>
  );
}

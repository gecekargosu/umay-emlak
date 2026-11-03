import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";

/**
 * Y-58: boşta ekran kilidi.
 * Sahada açık bırakılan ekranı korur; oturum çerezi değişmez, şifre yeniden
 * doğrulanır. Süre dolunca veri uçları zaten yetki kontrolünden geçer.
 */
const IDLE_MS = 15 * 60_000;

export function useIdleLock(): { locked: boolean; unlock: (password: string) => Promise<string | null> } {
  const [locked, setLocked] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLocked(true), IDLE_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((event) => window.removeEventListener(event, reset));
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function unlock(password: string): Promise<string | null> {
    try {
      await api("/auth/verify-password", { method: "POST", body: JSON.stringify({ password }) });
      setLocked(false);
      return null;
    } catch (error) {
      return error instanceof ApiError ? error.message : "Şifre doğrulanamadı";
    }
  }

  return { locked, unlock };
}

export function IdleLock({
  name,
  onUnlock,
}: {
  name: string;
  onUnlock: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="lock-overlay" role="dialog" aria-modal="true" aria-label="Ekran kilitli">
      <div className="lock-card">
        <h3>Ekran kilitlendi</h3>
        <p className="muted small">
          {name} · 15 dakika işlem yapılmadı. Devam etmek için şifrenizi girin; açık kayıtlar
          kaybolmaz.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(await onUnlock(password));
            setPassword("");
            setBusy(false);
          }}
        >
          <input
            type="password"
            value={password}
            autoFocus
            placeholder="Şifre"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy || password.length === 0}>
            Kilidi aç
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

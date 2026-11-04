import { useCallback, useEffect, useState } from "react";
import { api, userError } from "../api";

/**
 * Kiracı talep bağlantısı — TUR:55.
 *
 * Ofis buradan süreli bir bağlantı üretir, kiracıya WhatsApp/SMS ile gönderir.
 * Kiracı giriş yapmadan arıza bildirir; talep Görevler/arıza listesine düşer.
 * Bağlantı iptal edilebilir; satır silinmez (kim, ne zaman).
 */
type Link = {
  id: string;
  createdAt: string;
  expiresOn: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdBy: string | null;
  active: boolean;
};

function trDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR");
}

export function TenantRequestPanel({ contractId }: { contractId: string }) {
  const [items, setItems] = useState<Link[] | null>(null);
  const [fresh, setFresh] = useState<{ url: string; expiresOn: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Link[] }>(`/contracts/${contractId}/tenant-links`);
      setItems(data.items);
    } catch (caught) {
      setError(userError(caught, "Bağlantılar yüklenemedi"));
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api<{ token: string; expiresOn: string }>(
        `/contracts/${contractId}/tenant-links`,
        { method: "POST", body: JSON.stringify({ days: 90 }) },
      );
      setFresh({
        url: `${window.location.origin}/talep/${created.token}`,
        expiresOn: created.expiresOn,
      });
      setMessage("Bağlantı oluşturuldu. Jeton yalnız bir kez gösterilir — hemen kopyalayın.");
      await load();
    } catch (caught) {
      setError(userError(caught, "Bağlantı oluşturulamadı"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setMessage("Bağlantı kopyalandı. Kiracıya gönderebilirsiniz.");
    } catch {
      setMessage("Kopyalanamadı; bağlantıyı elle seçip kopyalayın.");
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/contracts/${contractId}/tenant-links/${id}`, { method: "DELETE" });
      setMessage("Bağlantı iptal edildi.");
      await load();
    } catch (caught) {
      setError(userError(caught, "Bağlantı iptal edilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4>Kiracı talep bağlantısı</h4>
      <p className="muted small">
        Kiracı giriş yapmadan arıza bildirebilsin. Bağlantı 90 gün geçerli; iptal
        ederseniz jeton anında iş görmez. Bildirimler Operasyon → Görevler ve arıza
        listesine düşer.
      </p>

      <div className="row-gap">
        <button type="button" disabled={busy} onClick={() => void create()}>
          Bağlantı oluştur
        </button>
      </div>

      {fresh && (
        <div className="inline-form">
          <input readOnly value={fresh.url} aria-label="Kiracı bağlantısı" onFocus={(e) => e.target.select()} />
          <button type="button" onClick={() => void copy()}>
            Kopyala
          </button>
          <span className="muted small">son geçerlilik {trDate(fresh.expiresOn)}</span>
        </div>
      )}

      {items === null && <p className="muted small">Yükleniyor…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Bu sözleşme için henüz bağlantı üretilmedi.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="doc-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.active ? "Geçerli" : item.revokedAt ? "İptal" : "Süresi doldu"}</strong>{" "}
              · {trDate(item.expiresOn)} tarihine kadar
              <div className="muted small">
                {item.useCount} bildirim · son kullanım {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("tr-TR") : "—"}
                {item.createdBy ? ` · ${item.createdBy}` : ""}
              </div>
              {item.active && (
                <button type="button" className="small-btn" disabled={busy} onClick={() => void revoke(item.id)}>
                  İptal et
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

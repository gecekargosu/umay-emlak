import { useEffect, useState } from "react";
import { api, userError } from "../api";

/**
 * Kiracı talep sayfası — TUR:55.
 *
 * Giriş yok: yetki, ofisin ürettiği süreli bağlantı jetonunda. Sayfa yalnız mülk
 * adını ve kiracıyı gösterir; başka hiçbir kayıt sızmaz. Bildirim, ofisin arıza
 * listesine "açık" olarak düşer.
 */
type Info = {
  title: string;
  district: string | null;
  city: string | null;
  tenantName: string;
  officeName: string;
  openCount: number;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "plumbing", label: "Su / tesisat" },
  { value: "electrical", label: "Elektrik" },
  { value: "heating", label: "Isıtma" },
  { value: "elevator", label: "Asansör" },
  { value: "appliance", label: "Beyaz eşya" },
  { value: "other", label: "Diğer" },
];

export function TenantRequestPublic({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "plumbing",
    priority: "normal",
    phone: "",
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Info>(`/public/tenant/${token}`)
      .then(setInfo)
      .catch((caught) => setLoadError(userError(caught, "Bağlantı açılamadı")));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.title.trim().length < 3) {
      setError("Konu en az 3 harf olmalı");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/public/tenant/${token}/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          category: form.category,
          priority: form.priority,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        }),
      });
      setSent(true);
    } catch (caught) {
      setError(userError(caught, "Bildirim gönderilemedi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: "40px auto", padding: "0 16px" }}>
      <div className="brand-block" style={{ marginBottom: 18 }}>
        <span className="brand-name">TRADEMARK</span>
        <span className="brand-sub">GAYRİMENKUL</span>
      </div>

      {loadError && (
        <div className="panel">
          <h2>Bağlantı kullanılamıyor</h2>
          <p className="error">{loadError}</p>
          <p className="muted small">
            Bağlantının süresi dolmuş veya iptal edilmiş olabilir. Ofisi arayıp yeni
            bağlantı isteyin.
          </p>
        </div>
      )}

      {!loadError && !info && <p className="muted">Yükleniyor…</p>}

      {info && sent && (
        <div className="panel">
          <h2>Bildiriminiz alındı</h2>
          <p>
            <strong>{info.title}</strong> için arıza kaydı ofise düştü. En kısa sürede
            aranacaksınız.
          </p>
          <p className="muted small">
            Ofis: {info.officeName} · Kiracı: {info.tenantName}
          </p>
        </div>
      )}

      {info && !sent && (
        <div className="panel">
          <h2>Arıza bildir</h2>
          <p className="muted small">
            {info.title} · {[info.district, info.city].filter(Boolean).join(", ")}
          </p>
          <p className="muted small">
            Merhaba {info.tenantName}. Aşağıdaki formu doldurun; kayıt doğrudan ofise düşer.
            {info.openCount > 0 ? ` Bu mülkte ${info.openCount} açık talep var.` : ""}
          </p>

          <form onSubmit={(event) => void submit(event)}>
            <div className="inline-form">
              <input
                placeholder="Konu (örn. Mutfak musluğu akıyor)"
                aria-label="Konu"
                value={form.title}
                maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                aria-label="Konu türü"
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                aria-label="Aciliyet"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Acil</option>
                <option value="low">Aceleye yok</option>
              </select>
            </div>
            <textarea
              className="handover-items"
              placeholder="Kısaca anlatın: ne zaman başladı, ne yapıyorsunuz…"
              value={form.description}
              maxLength={1000}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="inline-form">
              <input
                placeholder="Telefon (isteğe bağlı)"
                aria-label="Telefon"
                value={form.phone}
                maxLength={30}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <button type="submit" disabled={busy}>
                {busy ? "Gönderiliyor…" : "Bildirimi gönder"}
              </button>
            </div>
            {error && <p className="error small">{error}</p>}
          </form>

          <p className="hint">
            Bu bağlantı yalnız arıza bildirimi içindir; kira ödemesi buradan yapılmaz.
          </p>
        </div>
      )}
    </div>
  );
}

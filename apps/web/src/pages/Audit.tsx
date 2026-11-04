import { useCallback, useEffect, useState } from "react";
import { api, userError } from "../api";

/**
 * İşlem kaydı — TUR:53 (yol haritası 1. madde).
 *
 * "Kim ne yaptı" sorusunun ekranı: her yazma isteği (oluşturma/güncelleme/silme)
 * kişi, ofis, uç ve kayıt kimliğiyle saklanıyor (audit_log, K-6). Buradan
 * okunur; ekrandan DEĞİŞTİRİLEMEZ, silinemez — olması gereken de bu.
 *
 * Süzgeçler sunucuda: kişi, tarih aralığı, serbest arama (işlem, yol, kişi, kayıt no).
 */

type AuditRow = {
  id: string;
  ref: string | null;
  method: string;
  path: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  status: number | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
};

type AuditList = {
  items: AuditRow[];
  users: Array<{ id: string; name: string }>;
  total: number;
};

const ENTITY_TR: Record<string, string> = {
  properties: "mülk",
  listings: "ilan",
  people: "kişi",
  persons: "kişi",
  contracts: "sözleşme",
  handovers: "teslim tutanağı",
  policies: "poliçe",
  documents: "belge",
  charges: "tahakkuk",
  payments: "tahsilat",
  payouts: "aktarım",
  tasks: "görev",
  appointments: "randevu",
  maintenance: "arıza",
  team: "personel",
  offers: "teklif",
  media: "fotoğraf",
  audit: "denetim",
};

function whenText(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Audit() {
  const [data, setData] = useState<AuditList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (userId) params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", String(limit));
    try {
      const result = await api<AuditList>(`/audit?${params.toString()}`);
      setData(result);
      setError(null);
    } catch (caught) {
      setError(userError(caught, "İşlem kaydı yüklenemedi"));
    }
  }, [q, userId, from, to, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setQ(search);
  }

  function clearFilters() {
    setSearch("");
    setQ("");
    setUserId("");
    setFrom("");
    setTo("");
  }

  const items = data?.items ?? [];
  const shown = items.length;
  const total = data?.total ?? 0;

  return (
    <div className="audit-page">
      <div className="page-head">
        <h2>İşlem kaydı</h2>
        <span className="muted small">
          {shown} / {total} kayıt gösteriliyor
        </span>
      </div>

      <p className="info-note">
        Her kaydetme, düzeltme ve iptal burada kişi + saat + kayıt numarasıyla durur.
        Kayıt <strong>silinmez, değiştirilmez</strong>; bir şeyin kim tarafından
        değiştirildiğini buradan görürsünüz. Müşteriye “bunu kim yaptı” diye
        sorulduğunda cevap bu ekran.
      </p>

      <section className="panel">
        <form className="inline-form" onSubmit={applySearch}>
          <input
            placeholder="Ara: işlem, kişi, kayıt no (R-…)"
            aria-label="İşlem kaydında ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Personel">
            <option value="">Tüm personel</option>
            {(data?.users ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <label className="muted small">
            Başlangıç{" "}
            <input type="date" value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="muted small">
            Bitiş{" "}
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Kayıt sayısı">
            <option value={50}>50 kayıt</option>
            <option value={100}>100 kayıt</option>
            <option value={250}>250 kayıt</option>
            <option value={500}>500 kayıt</option>
          </select>
          <button type="submit">Ara</button>
          <button type="button" className="ghost" onClick={clearFilters}>
            Temizle
          </button>
        </form>
        {error && <p className="error small">{error}</p>}
      </section>

      <section className="panel">
        <div className="detail-head">
          <h3>Son işlemler</h3>
          <button type="button" className="ghost small" onClick={() => void load()}>
            Yenile
          </button>
        </div>

        {data === null && !error && <p className="muted">Yükleniyor…</p>}
        {data !== null && items.length === 0 && (
          <p className="muted small">
            Bu süzgeçte işlem yok. Tarihleri genişletin veya aramayı temizleyin.
          </p>
        )}
        {items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ne zaman</th>
                  <th>Kim</th>
                  <th>Ne yaptı</th>
                  <th>Kayıt</th>
                  <th>Yol</th>
                  <th>No</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={row.status && row.status >= 400 ? "row-danger" : ""}>
                    <td>{whenText(row.createdAt)}</td>
                    <td>
                      <strong>{row.userName ?? "—"}</strong>
                      {row.status && row.status >= 400 && (
                        <div className="muted small">HTTP {row.status}</div>
                      )}
                    </td>
                    <td>{row.action}</td>
                    <td>
                      {row.entityType ? (ENTITY_TR[row.entityType] ?? row.entityType) : "—"}
                      {row.entityId && (
                        <div className="muted small">{row.entityId.slice(0, 8)}…</div>
                      )}
                    </td>
                    <td className="small">{row.path}</td>
                    <td className="small">{row.ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ListingRow, type PolicyList, type PolicyRow } from "../api";

/**
 * Poliçeler — TUR:29 (yol haritası SIRA 3).
 *
 * Kullanıcı isteği: ana sayfadaki "DASK / poliçe" kutusu "planlı" demesin;
 * gerçek poliçe kaydı tutulsun, bitişten 30 gün önce uyarı çıksın.
 *
 * Ekran tam sayfa: mülk bazlı poliçe listesi (bitişe göre sıralı), yeni poliçe
 * formu ve satır düzeltme. Poliçe silinmez; yenileme yeni satır açar, geçmiş kalır.
 */

type Filter = "all" | "warning" | "expired";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Tümü" },
  { key: "warning", label: "30 günde bitecek" },
  { key: "expired", label: "Süresi geçti" },
];

const EMPTY_FORM = {
  propertyId: "",
  kind: "dask",
  insurer: "",
  policyNo: "",
  startDate: "",
  endDate: "",
  premiumText: "",
  note: "",
};

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function trDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR");
}

export function Policies() {
  const [list, setList] = useState<PolicyList | null>(null);
  const [properties, setProperties] = useState<Array<{ id: string; title: string }>>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<PolicyList>(`/policies?filter=${filter}`);
      setList(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mülk listesi: ilanlardan tekilleştirilir (mülk seçimi için yeterli).
  useEffect(() => {
    void api<{ items: ListingRow[] }>("/listings")
      .then((data) => {
        const map = new Map<string, string>();
        for (const row of data.items) {
          if (!map.has(row.propertyId)) map.set(row.propertyId, row.title);
        }
        setProperties(
          [...map.entries()]
            .map(([id, title]) => ({ id, title }))
            .sort((a, b) => a.title.localeCompare(b.title, "tr")),
        );
      })
      .catch(() => setProperties([]));
  }, []);

  const totals = useMemo(() => {
    const items = list?.items ?? [];
    const expired = items.filter((row) => row.expired).length;
    const warning = items.filter((row) => row.warning).length;
    return { count: items.length, expired, warning };
  }, [list]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(row: PolicyRow) {
    setEditingId(row.id);
    setForm({
      propertyId: row.propertyId,
      kind: row.kind,
      insurer: row.insurer ?? "",
      policyNo: row.policyNo ?? "",
      startDate: row.startDate ?? "",
      endDate: row.endDate,
      premiumText: row.premiumText ? row.premiumText.replace(/\./g, "").replace(",", ".") : "",
      note: row.note ?? "",
    });
    setMessage(null);
  }

  /** Yenileme: eski poliçe kalır, yeni dönem satırı açılır (bitiş +1 yıl). */
  function startRenew(row: PolicyRow) {
    const end = new Date(`${row.endDate}T00:00:00`);
    end.setFullYear(end.getFullYear() + 1);
    setEditingId(null);
    setForm({
      propertyId: row.propertyId,
      kind: row.kind,
      insurer: row.insurer ?? "",
      policyNo: "",
      startDate: row.endDate,
      endDate: end.toISOString().slice(0, 10),
      premiumText: "",
      note: `Yenileme: ${row.endDate} biten poliçenin devamı`,
    });
    setMessage(null);
  }

  async function save() {
    if (!form.propertyId) {
      setError("Mülk seçin");
      return;
    }
    if (!form.endDate) {
      setError("Bitiş tarihi gerekli");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (editingId) {
        await api(`/policies/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            insurer: form.insurer || null,
            policyNo: form.policyNo || null,
            startDate: form.startDate || null,
            endDate: form.endDate,
            premiumText: form.premiumText || null,
            note: form.note || null,
          }),
        });
        setMessage("Poliçe düzeltildi.");
      } else {
        await api("/policies", {
          method: "POST",
          body: JSON.stringify({
            propertyId: form.propertyId,
            kind: form.kind,
            insurer: form.insurer,
            policyNo: form.policyNo,
            startDate: form.startDate || undefined,
            endDate: form.endDate,
            premiumText: form.premiumText,
            note: form.note,
          }),
        });
        setMessage("Poliçe kaydedildi.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!list && error) return <div className="error">{error}</div>;

  return (
    <div className="policy-page">
      <div className="page-head">
        <h2>Poliçeler</h2>
        <span className="muted small">
          {totals.count} kayıt · {totals.warning} bitecek · {totals.expired} süresi geçmiş
        </span>
      </div>

      <p className="info-note">
        DASK ve konut poliçesi mülke bağlıdır; bitiş tarihi girilince 30 gün kala ana
        sayfada ve burada uyarı çıkar. Poliçe silinmez, yenileme yeni satır açar.
      </p>

      <section className="panel">
        <div className="detail-head">
          <h3>{editingId ? "Poliçeyi düzelt" : "Yeni poliçe"}</h3>
          {editingId && (
            <button type="button" className="ghost" onClick={resetForm}>
              Vazgeç
            </button>
          )}
        </div>
        <div className="inline-form">
          <select
            value={form.propertyId}
            onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
            disabled={Boolean(editingId)}
          >
            <option value="">Mülk seçin</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            disabled={Boolean(editingId)}
          >
            {list?.kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            )) ?? <option value="dask">DASK</option>}
          </select>
          <input
            placeholder="Sigorta şirketi"
            value={form.insurer}
            onChange={(e) => setForm({ ...form, insurer: e.target.value })}
          />
          <input
            placeholder="Poliçe no"
            value={form.policyNo}
            onChange={(e) => setForm({ ...form, policyNo: e.target.value })}
          />
        </div>
        <div className="inline-form">
          <label className="muted small">
            Başlangıç{" "}
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </label>
          <label className="muted small">
            Bitiş{" "}
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              min={todayIso(-3650)}
            />
          </label>
          <input
            placeholder="Prim (₺)"
            value={form.premiumText}
            onChange={(e) => setForm({ ...form, premiumText: e.target.value })}
          />
          <input
            placeholder="Not (isteğe bağlı)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <button type="button" disabled={busy} onClick={() => void save()}>
            {editingId ? "Düzeltmeyi kaydet" : "Poliçeyi kaydet"}
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="panel">
        <div className="detail-head">
          <h3>Poliçe listesi</h3>
          <span className="muted small">bitişe göre — en yakın üstte</span>
        </div>
        <div className="toolbar">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip${filter === item.key ? " active" : ""}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!list ? (
          <p className="muted">Yükleniyor…</p>
        ) : list.items.length === 0 ? (
          <p className="muted small">
            {filter === "all"
              ? "Henüz poliçe kaydı yok. Yukarıdaki formdan ekleyin."
              : "Bu filtrede poliçe yok."}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mülk</th>
                  <th>Tür</th>
                  <th>Şirket / poliçe no</th>
                  <th>Bitiş</th>
                  <th>Kalan</th>
                  <th>Prim</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.items.map((row) => (
                  <tr key={row.id} className={row.expired ? "row-danger" : ""}>
                    <td>
                      <strong>{row.propertyTitle}</strong>
                      {row.district && <div className="muted small">{row.district}</div>}
                    </td>
                    <td>{row.kindLabel}</td>
                    <td>
                      {row.insurer ?? "—"}
                      {row.policyNo && <div className="muted small">{row.policyNo}</div>}
                    </td>
                    <td>{trDate(row.endDate)}</td>
                    <td>
                      {row.expired ? (
                        <span className="badge">{Math.abs(row.daysLeft)} gün geçti</span>
                      ) : row.warning ? (
                        <span className="badge">{row.daysLeft} gün kaldı</span>
                      ) : (
                        <span className="muted small">{row.daysLeft} gün</span>
                      )}
                    </td>
                    <td>{row.premiumText ?? "—"}</td>
                    <td>
                      <div className="row-gap" style={{ marginTop: 0 }}>
                        <button type="button" className="small-btn" onClick={() => startEdit(row)}>
                          Düzelt
                        </button>
                        <button
                          type="button"
                          className="small-btn"
                          onClick={() => startRenew(row)}
                        >
                          Yenile
                        </button>
                      </div>
                    </td>
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

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ContractDetail, type ContractRow, type ListingRow, type PersonRow } from "../api";
import { InfoNote } from "../components/InfoNote";
import { useDraft } from "../hooks/useDraft";
import { formatKurusText } from "./Rents";
import { RentRevisionPanel } from "../components/RentRevisionPanel";

const STATUS_TR: Record<string, string> = { active: "Aktif", ended: "Bitti", cancelled: "İptal" };
const UTILITY_TR: Record<string, string> = {
  tenant: "Kiracı öder",
  office: "Ofis öder",
  owner: "Mal sahibi öder",
};

/**
 * Sözleşmeler — kiracılığın başladığı yer.
 * Sözleşme açılınca ilan kapanır; kira takvimi ay ay buradan üretilir.
 */
export function Contracts({ canApprove = false }: { canApprove?: boolean }) {
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [tenants, setTenants] = useState<PersonRow[]>([]);
  // Y-57: uzun form yarım kalmasın — taslak tarayıcıda tutulur.
  const [form, setForm, clearDraft] = useDraft("umay.contract.draft", {
    listingId: "",
    tenantPersonId: "",
    startDate: new Date().toISOString().slice(0, 10),
    rentText: "",
    depositText: "",
    dueDay: 5,
    utilityPayer: "tenant",
  });
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // H-13: ekran listeyle açılır; form yalnız "Yeni sözleşme" ile gelir.
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: ContractRow[] }>("/contracts");
      setRows(data.items);
      setError(null);
    } catch {
      setError("Sözleşmeler yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void load();
    void api<{ items: ListingRow[] }>("/listings")
      .then((data) => setListings(data.items.filter((l) => l.kind === "rent" && l.status !== "closed")))
      .catch(() => null);
    void api<{ items: PersonRow[] }>("/people?kind=tenant")
      .then((data) => setTenants(data.items))
      .catch(() => null);
  }, [load]);

  async function open(id: string) {
    try {
      setDetail(await api<ContractDetail>(`/contracts/${id}`));
      setError(null);
    } catch {
      setError("Sözleşme açılamadı");
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api<{ id: string }>("/contracts", {
        method: "POST",
        body: JSON.stringify({
          listingId: form.listingId,
          tenantPersonId: form.tenantPersonId,
          startDate: form.startDate,
          rentText: form.rentText,
          depositText: form.depositText || undefined,
          dueDay: Number(form.dueDay),
          utilityPayer: form.utilityPayer,
        }),
      });
      setMessage("Sözleşme açıldı, ilan kapandı.");
      clearDraft();
      setFormOpen(false);
      await load();
      await open(created.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sözleşme açılamadı");
    } finally {
      setBusy(false);
    }
  }

  async function generateCharge() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ created: boolean; message: string }>(
        `/contracts/${detail.contract.id}/charges`,
        { method: "POST", body: JSON.stringify({ period: `${period}-01` }) },
      );
      setMessage(result.message);
      await open(detail.contract.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Tahakkuk üretilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function endContract() {
    if (!detail) return;
    const reason = window.prompt("Sözleşme neden bitiyor? (opsiyonel)") ?? undefined;
    setBusy(true);
    try {
      await api(`/contracts/${detail.contract.id}/end`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
      });
      setMessage("Sözleşme kapatıldı. Geçmiş ve tahsilatlar duruyor.");
      await load();
      await open(detail.contract.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sözleşme kapatılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Sözleşmeler</h2>
        {!formOpen && (
          <button type="button" onClick={() => setFormOpen(true)}>
            Yeni sözleşme
          </button>
        )}
      </div>
      <InfoNote title="Sözleşme kiralık ilana bağlanır.">
        Açılınca ilan kapanır ve durum geçmişine yazılır. Depozito gelir değildir, ayrı alanda
        durur. Kira takvimi ay ay üretilir; <strong>aynı dönem ikinci kez işlenmez</strong>.
        Tahsilat "Kiralar" ekranından yapılır.
      </InfoNote>

      {formOpen && (
        <div className="panel">
          <div className="detail-head">
            <h3>Yeni kira sözleşmesi</h3>
            <button type="button" className="ghost" onClick={() => setFormOpen(false)}>
              Vazgeç
            </button>
          </div>
        {listings.length === 0 ? (
          <p className="muted">
            Kiralık ilan yok. Önce portföyden kiralık ilan açın (veya içe aktarın).
          </p>
        ) : (
          <div className="inline-form">
            <select
              value={form.listingId}
              onChange={(e) => setForm({ ...form, listingId: e.target.value })}
            >
              <option value="">İlan seçin</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {l.price}
                </option>
              ))}
            </select>
            <select
              value={form.tenantPersonId}
              onChange={(e) => setForm({ ...form, tenantPersonId: e.target.value })}
            >
              <option value="">Kiracı seçin</option>
              {tenants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
            <input
              placeholder="Kira (örn. 18.500)"
              value={form.rentText}
              onChange={(e) => setForm({ ...form, rentText: e.target.value })}
            />
            <input
              placeholder="Depozito (örn. 37.000)"
              value={form.depositText}
              onChange={(e) => setForm({ ...form, depositText: e.target.value })}
            />
            <select
              value={String(form.dueDay)}
              onChange={(e) => setForm({ ...form, dueDay: Number(e.target.value) })}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  Her ayın {day}.
                </option>
              ))}
            </select>
            <select
              value={form.utilityPayer}
              onChange={(e) => setForm({ ...form, utilityPayer: e.target.value })}
            >
              {Object.entries(UTILITY_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  Aidat/fatura: {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !form.listingId || !form.tenantPersonId || !form.rentText}
              onClick={() => void create()}
            >
              Sözleşmeyi aç
            </button>
          </div>
        )}
        <p className="hint">
          Depozito gelir değildir; ayrı alanda tutulur. Kiracı yoksa önce Kişiler ekranından
          “Kiracı” olarak ekleyin.
        </p>
        </div>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}

      {rows === null && <p className="muted">Yükleniyor…</p>}
      {rows !== null && rows.length === 0 && <p className="muted">Henüz sözleşme yok.</p>}

      {rows !== null && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Mülk</th>
              <th>Kiracı</th>
              <th>Başlangıç</th>
              <th className="right">Kira</th>
              <th>Vade günü</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={detail?.contract.id === row.id ? "selected" : "clickable"}
                onClick={() => void open(row.id)}
              >
                <td>{row.propertyTitle}</td>
                <td>{row.tenantName}</td>
                <td>{new Date(`${row.startDate}T00:00:00`).toLocaleDateString("tr-TR")}</td>
                <td className="right">{row.rent}</td>
                <td>{row.dueDay}.</td>
                <td>{STATUS_TR[row.status] ?? row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detail && (
        <div className="panel">
          <div className="detail-head">
            <h3>{detail.property.title}</h3>
            <span className="badge">{STATUS_TR[detail.contract.status] ?? detail.contract.status}</span>
          </div>
          <p className="muted small">
            Kiracı: {detail.tenant.fullName}
            {detail.tenant.phone ? ` · ${detail.tenant.phone}` : ""} · Kira: {detail.contract.rent} ·
            Depozito: {detail.contract.deposit} · Vade: her ayın {detail.contract.dueDay}.
          </p>

          {detail.contract.snapshot && (
            <p className="hint">
              İmza anındaki bilgiler donduruldu (
              {new Date(detail.contract.snapshot.frozenAt).toLocaleString("tr-TR")}):{" "}
              {detail.contract.snapshot.tenant.fullName} · {detail.contract.snapshot.property.title} ·{" "}
              {formatKurusText(detail.contract.snapshot.terms.rentKurus)}. Kişi veya mülk kartı sonradan
              değişse bile bu sözleşme ve ekstre değişmez.
            </p>
          )}

          <h4>Kira takvimi</h4>
          {detail.charges.length === 0 ? (
            <p className="muted small">Henüz tahakkuk yok.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>Vade</th>
                  <th className="right">Tutar</th>
                  <th className="right">Tahsil</th>
                  <th className="right">Kalan</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {detail.charges.map((charge) => (
                  <tr key={charge.id}>
                    <td>{charge.period.slice(0, 7)}</td>
                    <td>{new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}</td>
                    <td className="right">{charge.amount}</td>
                    <td className="right">{charge.paid}</td>
                    <td className="right">{charge.remaining}</td>
                    <td>
                      {charge.status === "paid" ? "Ödendi" : charge.status === "partial" ? "Kısmi" : "Açık"}
                      {charge.daysOverdue > 0 && charge.status !== "paid" && (
                        <span className="badge">{charge.daysOverdue} gün</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {detail.contract.status === "active" && (
            <>
              <h4>Tahakkuk üret</h4>
              <div className="inline-form">
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
                <button type="button" disabled={busy} onClick={() => void generateCharge()}>
                  Bu ayın kirasını işle
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={() => void endContract()}>
                  Sözleşmeyi bitir
                </button>
              </div>
              <p className="hint">
                Aynı dönem ikinci kez işlenmez. Tahsilat “Kiralar” ekranından yapılır.
              </p>
            </>
          )}

          <p className="muted small">
            Toplam tahakkuk: {formatKurusText(detail.totals.charged)} · Tahsil edilen:{" "}
            {formatKurusText(detail.totals.paid)} · Açık: {formatKurusText(detail.totals.open)}
          </p>

          <RentRevisionPanel contractId={detail.contract.id} canApprove={canApprove} />

          <h4>Hukuki metinler</h4>
          <div className="row-gap">
            <button
              type="button"
              onClick={() =>
                window.open(`/api/v1/contracts/${detail.contract.id}/contract-text`, "_blank")
              }
            >
              Sözleşme metnini aç
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                window.open(`/api/v1/contracts/${detail.contract.id}/output/tahliye`, "_blank")
              }
            >
              Tahliye taahhüdü yazdır
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                window.open(`/api/v1/contracts/${detail.contract.id}/output/kefalet`, "_blank")
              }
            >
              Kefaletname yazdır
            </button>
            <span className="muted small">Örnek şablon — avukat onayı gerekir.</span>
          </div>

          <div className="row-gap">
            <button type="button" className="ghost" onClick={() => setDetail(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


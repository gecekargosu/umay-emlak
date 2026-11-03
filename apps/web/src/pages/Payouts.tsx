import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type PayoutPreviewRow, type PayoutRow } from "../api";

/**
 * Sahipler — mal sahibine dönem aktarımı.
 *
 * Kural: aktarım, TAHSİL EDİLEN paraya göre hesaplanır (tahakkuka göre değil).
 * Kira takip bedeli elle girilir (K-22); net = tahsil - bedel - masraf.
 * Ekstre yazdırılabilir sayfa olarak açılır; tarayıcıdan PDF alınır.
 */
export function Payouts() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<PayoutPreviewRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [fees, setFees] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async (month: string) => {
    try {
      const data = await api<{ items: PayoutPreviewRow[] }>(`/payouts/preview?period=${month}-01`);
      setPreview(data.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Önizleme yüklenemedi");
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const data = await api<{ items: PayoutRow[] }>("/payouts");
      setPayouts(data.items);
    } catch {
      setError("Aktarımlar yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void loadPreview(period);
    void loadPayouts();
  }, [loadPreview, loadPayouts, period]);

  async function create(contractId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api<{ net: string }>("/payouts", {
        method: "POST",
        body: JSON.stringify({
          contractId,
          period: `${period}-01`,
          feeText: fees[contractId] ?? "0",
        }),
      });
      setMessage(`Aktarım oluşturuldu. Net: ${created.net}`);
      await loadPayouts();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Aktarım oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/payouts/${id}/pay`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Aktarım ödendi olarak işaretlendi.");
      await loadPayouts();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "İşaretlenemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Mal sahiplerine aktarım</h2>
      <p className="muted">
        Aktarım tahsil edilen paraya göre hesaplanır; tahsil edilmeyen kira sahibe aktarılmaz.
        Kira takip bedelini siz yazarsınız.
      </p>

      <div className="toolbar">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <span className="muted small">Dönem: {period}</span>
      </div>

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
      {preview === null && <p className="muted">Yükleniyor…</p>}
      {preview !== null && preview.length === 0 && (
        <p className="muted">Aktif kira sözleşmesi yok.</p>
      )}

      {preview !== null && preview.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Mülk</th>
              <th>Mal sahibi</th>
              <th>Kiracı</th>
              <th className="right">Tahsil edilen</th>
              <th>Takip bedeli</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.contractId}>
                <td>{row.propertyTitle}</td>
                <td>{row.ownerName}</td>
                <td className="muted">{row.tenantName}</td>
                <td className="right">{row.gross}</td>
                <td>
                  <input
                    placeholder="örn. 2.000"
                    value={fees[row.contractId] ?? ""}
                    onChange={(e) => setFees({ ...fees, [row.contractId]: e.target.value })}
                    style={{ width: 120 }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    disabled={busy || row.grossKurus === 0}
                    title={row.grossKurus === 0 ? "Bu dönemde tahsilat yok" : ""}
                    onClick={() => void create(row.contractId)}
                  >
                    Aktarım oluştur
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 26 }}>Aktarım kayıtları</h3>
      {payouts.length === 0 && <p className="muted">Henüz aktarım yok.</p>}
      {payouts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Dönem</th>
              <th>Mülk</th>
              <th>Mal sahibi</th>
              <th className="right">Tahsil</th>
              <th className="right">Bedel</th>
              <th className="right">Net</th>
              <th>Durum</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payouts.map((row) => (
              <tr key={row.id}>
                <td>{row.periodLabel}</td>
                <td>{row.propertyTitle}</td>
                <td>{row.ownerName ?? "—"}</td>
                <td className="right">{row.gross}</td>
                <td className="right">{row.fee}</td>
                <td className="right">{row.net}</td>
                <td>{row.status === "paid" ? "Ödendi" : "Taslak"}</td>
                <td>
                  <div className="row-gap">
                    <a
                      className="small"
                      href={`/api/v1/payouts/${row.id}/statement`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ekstre
                    </a>
                    {row.status === "draft" && (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void markPaid(row.id)}
                      >
                        Ödendi
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

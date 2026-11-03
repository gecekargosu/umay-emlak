import { useCallback, useEffect, useState } from "react";
import { api, kurusToText } from "../api";

/**
 * Kira artışı paneli — TUR:30 (SIRA 4).
 *
 * Kaynak dosyadaki kullanıcı notu: "TÜİK oranının kaynağı ve güncelleme tarihi
 * görünmeli, otomatik uygulanmamalı; yetkili onaylasın."
 * O yüzden burada taslak üretilir; "Onayla" yetkisi olmayan düğmeyi görmez.
 */

type Revision = {
  id: string;
  effectivePeriod: string;
  oldRentKurus: number;
  oldRentText: string;
  rateBp: number;
  rateText: string;
  newRentKurus: number;
  newRentText: string;
  diffKurus: number;
  diffText: string;
  source: string;
  sourceLabel: string;
  sourceNote: string | null;
  status: string;
  statusLabel: string;
  note: string | null;
  approvedAt: string | null;
  createdAt: string;
};

type Payload = {
  contract: {
    id: string;
    rentKurus: number;
    rentText: string;
    status: string;
    startDate: string;
    endDate: string | null;
  };
  items: Revision[];
};

function nextYearPeriod(): string {
  const d = new Date();
  return `${d.getFullYear() + 1}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function RentRevisionPanel({
  contractId,
  canApprove,
}: {
  contractId: string;
  canApprove: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [period, setPeriod] = useState(nextYearPeriod().slice(0, 7));
  const [rateText, setRateText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Payload>(`/contracts/${contractId}/rent-revisions`));
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const oldRent = data?.contract.rentKurus ?? 0;
  const rate = Number(rateText.replace(/[%\s]/g, "").replace(/\./g, "").replace(",", "."));
  const preview =
    Number.isFinite(rate) && rate >= 0 ? Math.round((oldRent * (10_000 + rate * 100)) / 10_000) : null;

  async function create() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/contracts/${contractId}/rent-revisions`, {
        method: "POST",
        body: JSON.stringify({
          effectivePeriod: `${period}-01`,
          rateText,
          source: "tuik",
          sourceNote: sourceNote || undefined,
          note: note || undefined,
        }),
      });
      setMessage("Artış taslağı oluştu. Onaylanınca sözleşme kirası güncellenir.");
      setRateText("");
      setNote("");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ newRentText: string }>(`/rent-revisions/${id}/approve`, {
        method: "POST",
      });
      setMessage(`Onaylandı. Yeni kira: ${result.newRentText}`);
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/rent-revisions/${id}/cancel`, { method: "POST" });
      setMessage("Taslak iptal edildi.");
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4>Kira artışı / yenileme</h4>
      <p className="hint">
        TÜİK’in açıkladığı 12 aylık ortalama oranı yaz (örn. 25,5). Program oranı{" "}
        <strong>kendiliğinden uygulamaz</strong>; taslak oluşur, yetkili onaylar. Kaynak notu
        sonradan tartışılmaması için saklanır.
      </p>

      {data && data.contract.status !== "active" ? (
        <p className="muted small">Sözleşme aktif değil; artış yapılamaz.</p>
      ) : (
        <>
          <div className="inline-form">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Artış dönemi"
            />
            <input
              placeholder="Oran (%) — örn. 25,5"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
            />
            <input
              placeholder="Oranın kaynağı (örn. TÜİK Ekim 2026 bülteni)"
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
            />
            <input
              placeholder="Not (isteğe bağlı)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" disabled={busy || !rateText} onClick={() => void create()}>
              Taslak oluştur
            </button>
          </div>
          {preview !== null && (
            <p className="muted small">
              Bugünkü kira {kurusToText(oldRent)} ₺ ·{" "}
              %{(Number.isFinite(rate) ? rate : 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}{" "}
              artışla{" "}
              <strong>{kurusToText(preview)} ₺</strong>
            </p>
          )}
        </>
      )}

      {error && <p className="error small">{error}</p>}
      {message && <p className="muted small">{message}</p>}

      {data && data.items.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th className="right">Eski kira</th>
                <th>Oran</th>
                <th className="right">Yeni kira</th>
                <th>Kaynak</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.effectivePeriod.slice(0, 7)}</td>
                  <td className="right">{row.oldRentText}</td>
                  <td>{row.rateText}</td>
                  <td className="right">
                    <strong>{row.newRentText}</strong>
                    <div className="muted small">+{row.diffText}</div>
                  </td>
                  <td>
                    {row.sourceLabel}
                    {row.sourceNote && <div className="muted small">{row.sourceNote}</div>}
                  </td>
                  <td>{row.statusLabel}</td>
                  <td>
                    {row.status === "proposed" && (
                      <div className="row-gap" style={{ marginTop: 0 }}>
                        {canApprove ? (
                          <button
                            type="button"
                            className="small-btn"
                            disabled={busy}
                            onClick={() => void approve(row.id)}
                          >
                            Onayla
                          </button>
                        ) : (
                          <span className="muted small">onay yetkisi gerekli</span>
                        )}
                        <button
                          type="button"
                          className="small-btn"
                          disabled={busy}
                          onClick={() => void cancel(row.id)}
                        >
                          İptal
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">Henüz artış kaydı yok.</p>
      )}
    </div>
  );
}

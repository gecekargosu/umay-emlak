import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";

/**
 * Komisyon ve kapora — TUR:25 (bilgi bankası 9-C / Y-79).
 * Varsayılan %3; oran/tutar elle değişir, indirimde gerekçe zorunlu.
 * Kapora alınınca ilan kaporalıya düşer, iade edilince aktife döner.
 */
type Commission = {
  id: string;
  rateText: string;
  amountText: string;
  discountReason: string | null;
  status: string;
  statusLabel: string;
};

type Money = {
  listing: { id: string; kind: string; status: string; priceKurus: number; priceText: string };
  items: Commission[];
  deposit: { amountKurus: number; amountText: string; receivedAt: string | null };
};

// eslint-disable-next-line react-refresh/only-export-components
export const LISTING_STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

export function ListingMoney({
  listingId,
  canApprove,
  onChanged,
}: {
  listingId: string;
  canApprove: boolean;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Money | null>(null);
  const [commission, setCommission] = useState({ rate: "3", amountText: "", reason: "" });
  const [deposit, setDeposit] = useState({ amountText: "", receivedAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Money>(`/listings/${listingId}/commissions`));
    } catch {
      setError("Komisyon bilgisi yüklenemedi");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCommission() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const rateBp = Math.round(Number(commission.rate.replace(",", ".")) * 100);
      await api(`/listings/${listingId}/commissions`, {
        method: "POST",
        body: JSON.stringify({
          ...(Number.isFinite(rateBp) && rateBp > 0 ? { rateBp } : {}),
          ...(commission.amountText.trim() ? { amountText: commission.amountText.trim() } : {}),
          ...(commission.reason.trim() ? { discountReason: commission.reason.trim() } : {}),
        }),
      });
      setMessage("Komisyon taslağı oluşturuldu.");
      setCommission({ rate: commission.rate, amountText: "", reason: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Komisyon kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/commissions/${id}/approve`, { method: "POST" });
      setMessage("Komisyon onaylandı.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Onaylanamadı");
    } finally {
      setBusy(false);
    }
  }

  async function saveDeposit(release = false) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ released: boolean; status: string }>(
        `/listings/${listingId}/deposit`,
        {
          method: "POST",
          body: JSON.stringify(
            release
              ? { release: true }
              : {
                  amountText: deposit.amountText.trim(),
                  ...(deposit.receivedAt ? { receivedAt: deposit.receivedAt } : {}),
                },
          ),
        },
      );
      setMessage(
        result.released
          ? "Kapora iade edildi, ilan aktife döndü."
          : `Kapora kaydedildi; ilan durumu: ${LISTING_STATUS_TR[result.status] ?? result.status}.`,
      );
      setDeposit({ amountText: "", receivedAt: "" });
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Kapora kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4>Komisyon ve kapora</h4>
      {data === null && <p className="muted small">Yükleniyor…</p>}
      {data !== null && (
        <>
          <p className="muted small">
            İlan fiyatı {data.listing.priceText} · durum{" "}
            {LISTING_STATUS_TR[data.listing.status] ?? data.listing.status} · kapora{" "}
            {data.deposit.amountKurus > 0
              ? `${data.deposit.amountText} (${data.deposit.receivedAt})`
              : "yok"}
          </p>

          {data.items.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Oran</th>
                    <th className="right">Tutar</th>
                    <th>Durum</th>
                    <th>Gerekçe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.rateText}</td>
                      <td className="right">{item.amountText}</td>
                      <td>{item.statusLabel}</td>
                      <td className="muted small">{item.discountReason ?? "—"}</td>
                      <td>
                        {item.status === "proposed" && (
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy || !canApprove}
                            title={canApprove ? "" : "Komisyon onayı yalnız onay yetkisinde"}
                            onClick={() => void approve(item.id)}
                          >
                            Onayla
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="inline-form" style={{ marginTop: 10 }}>
            <input
              placeholder="Oran %"
              inputMode="decimal"
              value={commission.rate}
              onChange={(e) => setCommission({ ...commission, rate: e.target.value })}
            />
            <input
              placeholder="Tutar (boşsa orandan hesaplanır)"
              inputMode="numeric"
              value={commission.amountText}
              onChange={(e) => setCommission({ ...commission, amountText: e.target.value })}
            />
            <input
              placeholder="İndirim gerekçesi (varsa zorunlu)"
              value={commission.reason}
              onChange={(e) => setCommission({ ...commission, reason: e.target.value })}
            />
            <button type="button" disabled={busy} onClick={() => void saveCommission()}>
              Komisyon ekle
            </button>
          </div>

          <div className="inline-form" style={{ marginTop: 8 }}>
            <input
              placeholder="Kapora tutarı (₺)"
              inputMode="numeric"
              value={deposit.amountText}
              onChange={(e) => setDeposit({ ...deposit, amountText: e.target.value })}
            />
            <input
              type="date"
              value={deposit.receivedAt}
              onChange={(e) => setDeposit({ ...deposit, receivedAt: e.target.value })}
            />
            <button
              type="button"
              disabled={busy || deposit.amountText.trim() === ""}
              onClick={() => void saveDeposit(false)}
            >
              Kapora alındı
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || data.deposit.amountKurus === 0}
              onClick={() => void saveDeposit(true)}
            >
              Kapora iade
            </button>
          </div>
          <p className="hint">
            Kapora alınınca ilan kendiliğinden “kaporalı” olur; iade edilirse yeniden “aktif”.
            Komisyon taslağı onay yetkisi olan kullanıcıyla kesinleşir.
          </p>
        </>
      )}
      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

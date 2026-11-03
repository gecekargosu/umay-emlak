import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type PersonRow } from "../api";

/**
 * Teklif / görüşme kaydı — TUR:24.
 * "Müşteriyle görüştüm, teklifini sisteme gireyim" akışı: ad + telefon + tutar +
 * kısa not. Kişi kayıtlıysa listeden seçilir, ad/telefon kendiliğinden dolar.
 */
type Offer = {
  id: string;
  bidderName: string;
  bidderPhone: string | null;
  amountKurus: number;
  amountText: string;
  status: string;
  statusLabel: string;
  note: string | null;
  createdAt: string;
};

const STATUS: Array<{ value: string; label: string }> = [
  { value: "received", label: "Teklif alındı" },
  { value: "negotiating", label: "Pazarlıkta" },
  { value: "accepted", label: "Kabul edildi" },
  { value: "rejected", label: "Reddedildi" },
];

export function ListingOffers({ listingId }: { listingId: string }) {
  const [items, setItems] = useState<Offer[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [form, setForm] = useState({
    personId: "",
    bidderName: "",
    bidderPhone: "",
    amountText: "",
    note: "",
    status: "received",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Offer[] }>(`/offers?listingId=${listingId}`);
      setItems(data.items);
    } catch {
      setError("Teklifler yüklenemedi");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
    void api<{ items: PersonRow[] }>("/people")
      .then((data) => setPeople(data.items))
      .catch(() => null);
  }, [load]);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/offers", {
        method: "POST",
        body: JSON.stringify({
          listingId,
          ...(form.personId ? { personId: form.personId } : {}),
          bidderName: form.bidderName.trim() || undefined,
          bidderPhone: form.bidderPhone.trim() || undefined,
          amountText: form.amountText.trim(),
          note: form.note.trim() || undefined,
          status: form.status,
        }),
      });
      setMessage("Teklif kaydedildi.");
      setForm({ personId: "", bidderName: "", bidderPhone: "", amountText: "", note: "", status: "received" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Teklif kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/offers/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Durum değiştirilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4>Alınan teklifler / görüşmeler</h4>
      {items === null && <p className="muted small">Yükleniyor…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Bu ilana henüz teklif girilmemiş.</p>
      )}
      {items !== null && items.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Telefon</th>
                <th className="right">Teklif</th>
                <th>Durum</th>
                <th>Not</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {items.map((offer) => (
                <tr key={offer.id}>
                  <td>{offer.bidderName}</td>
                  <td className="muted">{offer.bidderPhone ?? "—"}</td>
                  <td className="right">{offer.amountText}</td>
                  <td>
                    <select
                      value={offer.status}
                      disabled={busy}
                      onChange={(e) => void setStatus(offer.id, e.target.value)}
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="muted small">{offer.note ?? "—"}</td>
                  <td className="muted small">
                    {new Date(offer.createdAt).toLocaleDateString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inline-form" style={{ marginTop: 10 }}>
        <select
          value={form.personId}
          onChange={(e) => {
            const person = people.find((p) => p.id === e.target.value);
            setForm({
              ...form,
              personId: e.target.value,
              bidderName: person?.fullName ?? form.bidderName,
              bidderPhone: person?.phone ?? form.bidderPhone,
            });
          }}
        >
          <option value="">Müşteri kayıtlı değil (elle gir)</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
        <input
          placeholder="Müşteri adı"
          value={form.bidderName}
          onChange={(e) => setForm({ ...form, bidderName: e.target.value })}
        />
        <input
          placeholder="Telefon"
          value={form.bidderPhone}
          onChange={(e) => setForm({ ...form, bidderPhone: e.target.value })}
        />
        <input
          placeholder="Teklif tutarı (₺)"
          inputMode="numeric"
          value={form.amountText}
          onChange={(e) => setForm({ ...form, amountText: e.target.value })}
        />
        <input
          placeholder="Görüşme notu (isteğe bağlı)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || form.amountText.trim() === ""}
          onClick={() => void save()}
        >
          Teklifi kaydet
        </button>
      </div>
      <p className="hint">
        Telefonla gelen müşteri kayıtlı olmayabilir: adı yazıp tutarı girmek yeterli. Teklif
        silinmez, durumu değişir (pazarlıkta → kabul/red).
      </p>
      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

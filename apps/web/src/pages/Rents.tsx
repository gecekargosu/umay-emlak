import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ChargeRow } from "../api";
import { InfoNote } from "../components/InfoNote";

const METHOD_TR: Record<string, string> = {
  transfer: "Havale / EFT",
  office_account: "Ofis hesabına",
  cash_office: "Elden nakit",
  card: "Kart",
  offset: "Mahsup",
};

type PayForm = {
  chargeId: string;
  amountText: string;
  method: string;
  receivedByName: string;
  note: string;
};

/**
 * Kiralar — "bugün kim ödemedi" ekranı.
 * Tahsilat kaydı silinmez; fazla ödeme sunucuda reddedilir, elden nakitte
 * teslim alan zorunludur (K-21).
 */
export function Rents() {
  const [rows, setRows] = useState<ChargeRow[] | null>(null);
  const [scope, setScope] = useState("open");
  const [pay, setPay] = useState<PayForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextScope: string) => {
    try {
      const data = await api<{ items: ChargeRow[] }>(`/charges?scope=${nextScope}`);
      setRows(data.items);
      setError(null);
    } catch {
      setError("Kiralar yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  async function submitPayment() {
    if (!pay) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ status: string; remaining: string }>(
        `/charges/${pay.chargeId}/payments`,
        {
          method: "POST",
          body: JSON.stringify({
            amountText: pay.amountText,
            method: pay.method,
            receivedByName: pay.receivedByName || undefined,
            note: pay.note || undefined,
          }),
        },
      );
      setMessage(
        result.status === "paid"
          ? "Tahsilat tamamlandı, tahakkuk kapandı."
          : `Kısmi tahsilat kaydedildi. Kalan: ${result.remaining}`,
      );
      setPay(null);
      await load(scope);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Tahsilat kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function sendNotice(chargeId: string, level: "reminder" | "formal") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/charges/${chargeId}/notice`, {
        method: "POST",
        body: JSON.stringify({ level, channel: "phone" }),
      });
      setMessage(
        level === "reminder"
          ? "Hatırlatma kaydedildi."
          : "İhtarname kaydı düşüldü (evrak ayrıca saklanmalı).",
      );
      await load(scope);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Bildirim kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  const totals = (rows ?? []).reduce(
    (acc, row) => ({
      remaining: acc.remaining + row.remainingKurus,
      overdue: acc.overdue + (row.daysOverdue > 0 ? 1 : 0),
    }),
    { remaining: 0, overdue: 0 },
  );

  return (
    <div>
      <div className="page-head">
        <h2>Kiralar</h2>
      </div>
      <InfoNote title="Tahsilat tahakkuka mahsup edilir.">
        Fazla ödeme reddedilir, kısmi ödeme serbesttir ve kalan borç görünür. <strong>Elden
        nakitte teslim alan kişi zorunludur</strong> (K-21). Kayıt silinmez; hatalı kayıt ters
        kayıtla düzeltilecek (henüz ekranı yok). Gecikmede 3 gün hatırlatma, 15 gün ihtarname
        adayı sayılır.
      </InfoNote>

      <div className="toolbar">
        {[
          ["open", "Açık"],
          ["overdue", "Gecikmiş"],
          ["paid", "Ödenmiş"],
          ["all", "Tümü"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={scope === value ? "" : "ghost"}
            onClick={() => setScope(value!)}
          >
            {label}
          </button>
        ))}
        <span className="muted small">
          {rows?.length ?? 0} kayıt · kalan toplam {formatKurusText(totals.remaining)} · gecikmiş{" "}
          {totals.overdue}
        </span>
      </div>

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
      {rows === null && <p className="muted">Yükleniyor…</p>}
      {rows !== null && rows.length === 0 && <p className="muted">Bu filtrede kayıt yok.</p>}

      {rows !== null && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Kiracı</th>
              <th>Mülk</th>
              <th>Dönem</th>
              <th>Vade</th>
              <th className="right">Tutar</th>
              <th className="right">Kalan</th>
              <th>Durum</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.daysOverdue > 0 ? "overdue" : ""}>
                <td>
                  {row.tenantName}
                  {row.tenantPhone && <div className="muted small">{row.tenantPhone}</div>}
                </td>
                <td>{row.propertyTitle}</td>
                <td>{row.period.slice(0, 7)}</td>
                <td>
                  {new Date(`${row.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}
                  {row.daysOverdue > 0 && (
                    <div className="muted small">{row.daysOverdue} gün gecikme</div>
                  )}
                </td>
                <td className="right">{row.amount}</td>
                <td className="right">{row.remaining}</td>
                <td>
                  {row.status === "paid" ? "Ödendi" : row.status === "partial" ? "Kısmi" : "Açık"}
                  {row.nextAction && (
                    <span className="badge">
                      {row.nextAction === "formal" ? "ihtarname" : "hatırlatma"}
                    </span>
                  )}
                </td>
                <td>
                  {row.status !== "paid" && (
                    <div className="row-gap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPay({
                            chargeId: row.id,
                            amountText: row.remaining.replace(/\s?₺/, "").trim(),
                            method: "transfer",
                            receivedByName: "",
                            note: "",
                          })
                        }
                      >
                        Tahsil et
                      </button>
                      {row.daysOverdue > 0 && (
                        <>
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy}
                            onClick={() => void sendNotice(row.id, "reminder")}
                          >
                            Hatırlat
                          </button>
                          {row.daysOverdue >= 15 && !row.noticeSentAt && (
                            <button
                              type="button"
                              className="ghost"
                              disabled={busy}
                              onClick={() => void sendNotice(row.id, "formal")}
                            >
                              İhtarname
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pay && (
        <div className="panel">
          <h3>Tahsilat</h3>
          <div className="inline-form">
            <input
              placeholder="Tutar (örn. 18.500)"
              value={pay.amountText}
              onChange={(e) => setPay({ ...pay, amountText: e.target.value })}
            />
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {Object.entries(METHOD_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              placeholder="Teslim alan (elden/ofis ise zorunlu)"
              value={pay.receivedByName}
              onChange={(e) => setPay({ ...pay, receivedByName: e.target.value })}
            />
            <input
              placeholder="Not (isteğe bağlı)"
              value={pay.note}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
            />
            <button type="button" disabled={busy} onClick={() => void submitPayment()}>
              Kaydet
            </button>
            <button type="button" className="ghost" onClick={() => setPay(null)}>
              Vazgeç
            </button>
          </div>
          <p className="hint">
            Kısmi ödeme serbesttir; kalan borç görünür. Fazla ödeme sunucuda reddedilir.
          </p>
        </div>
      )}
    </div>
  );
}

/** Yalnız gösterim: kuruş → "12.500,00 ₺". */
export function formatKurusText(kurus: number): string {
  return `${(kurus / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

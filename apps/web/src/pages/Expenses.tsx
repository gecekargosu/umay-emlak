import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  userError,
  type ExpenseList,
  type ExpenseRow,
  type ListingRow,
  type Statement,
  type StatementOwnerList,
} from "../api";

/**
 * Giderler + mal sahibi hesap ekstresi — TUR:60 (yol haritası 2. madde).
 *
 * Mülke bağlı gider tutulur (tamir, aidat, temizlik, sigorta, vergi, komisyon).
 * Ekstre ayrı sayfada açılır (geri düğmesi vardır) ve yazdırılabilir.
 * Gider silinmez: düzeltilir veya iptal edilir; iptal edilen ekstreye girmez.
 */

type Form = {
  propertyId: string;
  category: string;
  amountText: string;
  spentOn: string;
  vendor: string;
  note: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}

function trDate(iso: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR");
}

const EMPTY_FORM: Form = {
  propertyId: "",
  category: "tamir",
  amountText: "",
  spentOn: todayIso(),
  vendor: "",
  note: "",
};

export function Expenses() {
  const [list, setList] = useState<ExpenseList | null>(null);
  const [properties, setProperties] = useState<Array<{ id: string; title: string }>>([]);
  const [propQuery, setPropQuery] = useState("");
  const [status, setStatus] = useState("aktif");
  const [form, setForm] = useState<Form>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mal sahibi ekstresi
  const [owners, setOwners] = useState<StatementOwnerList | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [statement, setStatement] = useState<Statement | null>(null);
  const [statementBusy, setStatementBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<ExpenseList>(`/expenses?status=${status}`);
      setList(data);
      setError(null);
    } catch (caught) {
      setError(userError(caught, "Giderler yüklenemedi"));
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api<StatementOwnerList>("/statements/owners")
      .then(setOwners)
      .catch(() => setOwners(null));
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
      .catch((caught) => setError(userError(caught, "Mülk listesi yüklenemedi")));
  }, []);

  const filteredProperties = useMemo(() => {
    const q = propQuery.trim().toLocaleLowerCase("tr");
    if (!q) return properties;
    const hits = properties.filter((p) => p.title.toLocaleLowerCase("tr").includes(q));
    const selected = properties.find((p) => p.id === form.propertyId);
    return selected && !hits.some((p) => p.id === selected.id) ? [selected, ...hits] : hits;
  }, [properties, propQuery, form.propertyId]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(row: ExpenseRow) {
    setEditingId(row.id);
    setPropQuery("");
    setForm({
      propertyId: row.propertyId,
      category: row.category,
      amountText: String(row.amountKurus / 100).replace(".", ","),
      spentOn: row.spentOn,
      vendor: row.vendor ?? "",
      note: row.note ?? "",
    });
    setMessage(null);
    setError(null);
  }

  async function save() {
    if (!form.propertyId) {
      setError("Mülk seçin");
      return;
    }
    if (!form.amountText.trim()) {
      setError("Tutar girin");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (editingId) {
        await api(`/expenses/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            category: form.category,
            amountText: form.amountText,
            spentOn: form.spentOn,
            vendor: form.vendor || null,
            note: form.note || null,
          }),
        });
        setMessage("Gider düzeltildi.");
      } else {
        await api("/expenses", {
          method: "POST",
          body: JSON.stringify({
            propertyId: form.propertyId,
            category: form.category,
            amountText: form.amountText,
            spentOn: form.spentOn,
            vendor: form.vendor,
            note: form.note,
          }),
        });
        setMessage("Gider kaydedildi.");
      }
      resetForm();
      await load();
    } catch (caught) {
      setError(userError(caught, "Gider kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelExpense(row: ExpenseRow) {
    if (!window.confirm(`${row.propertyTitle} · ${row.amountText} gideri iptal edilsin mi?`)) return;
    setError(null);
    setMessage(null);
    try {
      await api(`/expenses/${row.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: "ofis kaydı" }),
      });
      setMessage("Gider iptal edildi (kayıt silinmedi).");
      await load();
    } catch (caught) {
      setError(userError(caught, "Gider iptal edilemedi"));
    }
  }

  async function openStatement(forOwnerId?: string) {
    const target = forOwnerId ?? ownerId;
    if (!target) {
      setError("Ekstre için mal sahibi seçin");
      return;
    }
    setStatementBusy(true);
    setError(null);
    try {
      const data = await api<Statement>(`/statements/owners/${target}?from=${from}&to=${to}`);
      setStatement(data);
    } catch (caught) {
      setError(userError(caught, "Ekstre açılamadı"));
    } finally {
      setStatementBusy(false);
    }
  }

  // Ekstre: ayrı sayfa görünümü, geri düğmesi ile listeye döner.
  if (statement) {
    return (
      <div className="statement-page">
        <div className="page-head no-print">
          <h2>Hesap ekstresi</h2>
          <div className="row-gap" style={{ marginTop: 0 }}>
            <button type="button" className="ghost" onClick={() => setStatement(null)}>
              ← Geri
            </button>
            <button type="button" onClick={() => window.print()}>
              Yazdır / PDF
            </button>
          </div>
        </div>

        <section className="panel statement-sheet">
          <div className="statement-head">
            <div>
              <strong>TRADEMARK GAYRİMENKUL</strong>
              <div className="muted small">Mal sahibi hesap ekstresi</div>
            </div>
            <div className="small">
              <div>
                <strong>{statement.owner.name}</strong>
              </div>
              <div className="muted">
                Dönem: {trDate(statement.period.from)} – {trDate(statement.period.to)}
              </div>
              <div className="muted">
                Düzenleme: {new Date(statement.printedAt).toLocaleString("tr-TR")}
              </div>
            </div>
          </div>

          {statement.properties.length === 0 ? (
            <p className="muted">Bu mal sahibine bağlı mülk yok.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mülk</th>
                    <th>Tahakkuk</th>
                    <th>Tahsil</th>
                    <th>Kalan</th>
                    <th>Gider</th>
                    <th>Takip bedeli</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.properties.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        {row.district && <div className="muted small">{row.district}</div>}
                      </td>
                      <td>{row.chargedText}</td>
                      <td>{row.collectedText}</td>
                      <td>{row.outstandingText}</td>
                      <td>{row.expensesText}</td>
                      <td>{row.feeText}</td>
                      <td>
                        <strong>{row.netText}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr className="statement-total">
                    <td>
                      <strong>TOPLAM</strong>
                    </td>
                    <td>{statement.totals.chargedText}</td>
                    <td>{statement.totals.collectedText}</td>
                    <td>{statement.totals.outstandingText}</td>
                    <td>{statement.totals.expensesText}</td>
                    <td>{statement.totals.feeText}</td>
                    <td>
                      <strong>{statement.totals.netText}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="muted small">
            Net = tahsil edilen kira − mülk giderleri − kira takip bedeli. Tahsil edilmeyen
            kira "kalan" sütununda durur, nete girmez. İptal edilen giderler bu ekstrede
            görünmez (kayıt silinmez, iptal olarak iz kalır).
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="expense-page">
      <div className="page-head">
        <h2>Giderler</h2>
        <span className="muted small">
          {list ? `${list.count} kayıt · toplam ${list.totalText}` : "yükleniyor…"}
        </span>
      </div>

      <p className="info-note">
        Gider mülke bağlıdır: tamir, aidat, temizlik, sigorta, vergi, komisyon. Gider silinmez;
        yanlış giriş düzeltilir, vazgeçilen gider <strong>iptal</strong> edilir ve ekstre
        hesabına girmez.
      </p>

      <section className="panel">
        <div className="detail-head">
          <h3>{editingId ? "Gideri düzelt" : "Yeni gider"}</h3>
          {editingId && (
            <button type="button" className="ghost" onClick={resetForm}>
              Vazgeç
            </button>
          )}
        </div>
        <div className="inline-form">
          <input
            placeholder="Mülk ara (örn. Konak)"
            aria-label="Mülk ara"
            value={propQuery}
            onChange={(e) => setPropQuery(e.target.value)}
            disabled={Boolean(editingId)}
          />
          <select
            value={form.propertyId}
            onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
            disabled={Boolean(editingId)}
            aria-label="Mülk"
          >
            <option value="">
              {properties.length === 0
                ? "Mülk seçin"
                : filteredProperties.length === 0
                  ? "Eşleşen mülk yok"
                  : `Mülk seçin — ${filteredProperties.length}/${properties.length}`}
            </option>
            {filteredProperties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            aria-label="Gider türü"
          >
            {(list?.categories ?? [{ category: "tamir", label: "Tamir / bakım" }]).map((c) => (
              <option key={c.category} value={c.category}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-form">
          <input
            placeholder="Tutar (örn. 2.750)"
            aria-label="Tutar"
            value={form.amountText}
            onChange={(e) => setForm({ ...form, amountText: e.target.value })}
          />
          <label className="muted small">
            Tarih{" "}
            <input
              type="date"
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
            />
          </label>
          <input
            placeholder="Kim yaptı / kime ödendi"
            aria-label="Satıcı"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
          <input
            placeholder="Not (isteğe bağlı)"
            aria-label="Not"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <button type="button" disabled={busy} onClick={() => void save()}>
            {editingId ? "Düzeltmeyi kaydet" : "Gideri kaydet"}
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="panel">
        <div className="detail-head">
          <h3>Mal sahibi hesap ekstresi</h3>
          <span className="muted small">yazdırılabilir · ayrı sayfada açılır</span>
        </div>
        <div className="inline-form">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Mal sahibi">
            <option value="">
              {owners && owners.count > 0 ? `Mal sahibi seçin (${owners.count})` : "Mal sahibi yok"}
            </option>
            {owners?.items.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name} · {owner.propertyCount} mülk
              </option>
            ))}
          </select>
          <label className="muted small">
            Başlangıç{" "}
            <input
              type="date"
              aria-label="Ekstre başlangıç"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="muted small">
            Bitiş{" "}
            <input
              type="date"
              aria-label="Ekstre bitiş"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button type="button" disabled={statementBusy} onClick={() => void openStatement()}>
            {statementBusy ? "Hazırlanıyor…" : "Ekstreyi aç"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="detail-head">
          <h3>Gider listesi</h3>
          <span className="muted small">tarihe göre — en yeni üstte</span>
        </div>
        <div className="toolbar">
          {(list?.statuses ?? [
            { status: "aktif", label: "Aktif" },
            { status: "iptal", label: "İptal" },
            { status: "all", label: "Tümü" },
          ]).map((item) => (
            <button
              key={item.status}
              type="button"
              className={`chip${status === item.status ? " active" : ""}`}
              onClick={() => setStatus(item.status)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!list ? (
          <p className="muted">Yükleniyor…</p>
        ) : list.items.length === 0 ? (
          <p className="muted small">Bu süzgeçte gider yok. Yukarıdaki formdan ekleyin.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mülk</th>
                  <th>Mal sahibi</th>
                  <th>Tür</th>
                  <th>Tarih</th>
                  <th>Tutar</th>
                  <th>Kim / not</th>
                  <th>Durum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.items.map((row) => (
                  <tr key={row.id} className={row.status === "iptal" ? "row-danger" : ""}>
                    <td>
                      <strong>{row.propertyTitle}</strong>
                      {row.district && <div className="muted small">{row.district}</div>}
                    </td>
                    <td>{row.ownerName ?? "—"}</td>
                    <td>{row.categoryLabel}</td>
                    <td>{trDate(row.spentOn)}</td>
                    <td>{row.amountText}</td>
                    <td>
                      {row.vendor ?? "—"}
                      {row.note && <div className="muted small">{row.note}</div>}
                    </td>
                    <td>{row.statusLabel}</td>
                    <td>
                      <div className="row-gap" style={{ marginTop: 0 }}>
                        {row.ownerId && (
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => void openStatement(row.ownerId ?? undefined)}
                          >
                            Ekstre
                          </button>
                        )}
                        {row.status === "aktif" && (
                          <>
                            <button
                              type="button"
                              className="small-btn"
                              onClick={() => startEdit(row)}
                            >
                              Düzelt
                            </button>
                            <button
                              type="button"
                              className="small-btn"
                              onClick={() => void cancelExpense(row)}
                            >
                              İptal
                            </button>
                          </>
                        )}
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

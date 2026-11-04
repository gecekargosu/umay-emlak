import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";

/**
 * Teslim tutanağı paneli — TUR:28 (SIRA 2).
 * Giriş/çıkış tutanağı, demirbaş satırları ve çıkışta depozito iadesi.
 */
type Handover = {
  id: string;
  kindLabel: string;
  happenedOn: string;
  items: Array<{ name: string; quantity: number; condition?: string }>;
  depositText: string;
  deductionText: string;
  deductionNote: string | null;
  refundText: string;
};

export function HandoverPanel({ contractId, depositText }: { contractId: string; depositText: string }) {
  const [items, setItems] = useState<Handover[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kind: "move_out",
    happenedOn: new Date().toISOString().slice(0, 10),
    itemsText: "",
    deductionText: "",
    deductionNote: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Handover[] }>(`/contracts/${contractId}/handovers`);
      setItems(data.items);
    } catch {
      setError("Tutanaklar yüklenemedi");
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  function parseItems(): Array<{ name: string; quantity: number; condition?: string }> {
    return form.itemsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, quantity, condition] = line.split("|").map((part) => part.trim());
        return {
          name: name ?? "Demirbaş",
          quantity: Number(quantity) > 0 ? Number(quantity) : 1,
          ...(condition ? { condition } : {}),
        };
      });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api<{ refundText: string }>(
        `/contracts/${contractId}/handovers`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: form.kind,
            happenedOn: form.happenedOn,
            items: parseItems(),
            ...(form.deductionText.trim() ? { deductionText: form.deductionText.trim() } : {}),
            ...(form.deductionNote.trim() ? { deductionNote: form.deductionNote.trim() } : {}),
          }),
        },
      );
      setMessage(
        form.kind === "move_out"
          ? `Çıkış tutanağı kaydedildi. İade: ${created.refundText}`
          : "Giriş tutanağı kaydedildi.",
      );
      setForm({ ...form, itemsText: "", deductionText: "", deductionNote: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Tutanak kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4>Teslim tutanağı</h4>
      <p className="muted small">Sözleşmedeki depozito: {depositText}</p>

      {items === null && <p className="muted small">Yükleniyor…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Henüz tutanak yok.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="doc-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>
                {item.kindLabel} · {new Date(`${item.happenedOn}T00:00:00`).toLocaleDateString("tr-TR")}
              </strong>
              <div className="muted small">
                Depozito {item.depositText} · kesinti {item.deductionText} · iade {item.refundText}
                {item.deductionNote ? ` · ${item.deductionNote}` : ""}
              </div>
              {item.items.length > 0 && (
                <div className="muted small">
                  {item.items
                    .map((row) => `${row.name} ${row.quantity}${row.condition ? ` (${row.condition})` : ""}`)
                    .join(" · ")}
                </div>
              )}
              <a
                className="small"
                href={`/api/v1/contracts/${contractId}/handovers/${item.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Tutanak PDF (fotoğraflı, imza alanlı)
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="inline-form">
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="move_in">Giriş tutanağı</option>
          <option value="move_out">Çıkış tutanağı</option>
        </select>
        <input
          type="date"
          value={form.happenedOn}
          onChange={(e) => setForm({ ...form, happenedOn: e.target.value })}
        />
        <input
          placeholder="Kesinti (₺)"
          inputMode="numeric"
          value={form.deductionText}
          onChange={(e) => setForm({ ...form, deductionText: e.target.value })}
        />
        <input
          placeholder="Kesinti gerekçesi"
          value={form.deductionNote}
          onChange={(e) => setForm({ ...form, deductionNote: e.target.value })}
        />
      </div>
      <textarea
        className="handover-items"
        placeholder={"Demirbaş satırları (her satır: ad|adet|durum)\nKlima|1|sağlam\nAnahtar|2|teslim"}
        value={form.itemsText}
        onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
      />
      <div className="row-gap">
        <button type="button" disabled={busy} onClick={() => void save()}>
          Tutanağı kaydet
        </button>
      </div>
      <p className="hint">
        Çıkış tutanağında iade = depozito − kesinti. Tutanak silinmez; düzeltme yeni tutanakla yapılır.
      </p>
      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

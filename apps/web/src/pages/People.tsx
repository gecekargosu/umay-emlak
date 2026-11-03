import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type PersonRow } from "../api";

const KIND_TR: Record<string, string> = {
  owner: "Mal sahibi",
  tenant: "Kiracı",
  candidate: "Aday",
};

type Duplicate = { duplicate?: { id: string; fullName: string } };

export function People() {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", kind: "owner" });
  const [duplicate, setDuplicate] = useState<Duplicate["duplicate"] | null>(null);

  const load = useCallback(
    async (q: string) => {
      try {
        const data = await api<{ items: PersonRow[] }>(`/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        setRows(data.items);
        setError(null);
      } catch {
        setError("Kişiler yüklenemedi");
      }
    },
    [],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  async function save(force = false) {
    setError(null);
    setDuplicate(null);
    try {
      await api(`/people${force ? "?force=1" : ""}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ fullName: "", phone: "", kind: "owner" });
      await load(query);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        const payload = caught.payload as Duplicate;
        setDuplicate(payload?.duplicate ?? null);
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "Kaydedilemedi");
    }
  }

  return (
    <div>
      <h2>Kişiler</h2>

      <div className="toolbar">
        <input
          placeholder="İsim veya telefon ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(query);
          }}
        />
        <button type="button" className="secondary" onClick={() => void load(query)}>
          Ara
        </button>
      </div>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          placeholder="Ad soyad"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />
        <input
          placeholder="Telefon"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="owner">Mal sahibi</option>
          <option value="tenant">Kiracı</option>
          <option value="candidate">Aday</option>
        </select>
        <button type="submit">Ekle</button>
      </form>

      {duplicate && (
        <div className="alert">
          <strong>{duplicate.fullName}</strong> zaten kayıtlı. Aynı kişiyse yeni kayıt açmayın.
          <div className="row-gap">
            <button type="button" className="secondary" onClick={() => void save(true)}>
              Yine de ekle
            </button>
            <button type="button" className="ghost" onClick={() => setDuplicate(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Ad soyad</th>
            <th>Telefon</th>
            <th>Tür</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.fullName}</td>
              <td className="muted">{row.phone ?? "—"}</td>
              <td>{KIND_TR[row.kind] ?? row.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Kayıt yok.</p>}
    </div>
  );
}

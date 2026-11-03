import { useCallback, useEffect, useState } from "react";
import { api, ApiError, kurusToText, type PersonNote, type PersonRow } from "../api";
import { InfoNote } from "../components/InfoNote";
import { BackButton } from "../components/BackButton";

const KIND_TR: Record<string, string> = {
  owner: "Mal sahibi",
  tenant: "Kiracı",
  candidate: "Aday",
};

const STAGE_TR: Record<string, string> = {
  "": "—",
  new: "Yeni",
  contacted: "Görüşüldü",
  viewing: "Yer gösterildi",
  offer: "Teklif",
  won: "Anlaşıldı",
  lost: "Vazgeçti",
};

const PERMISSION_TR: Record<string, string> = {
  unknown: "İzin bilinmiyor",
  allowed: "İzin var",
  denied: "İzin yok",
};

type Duplicate = { duplicate?: { id: string; fullName: string } };

type PersonDetail = {
  person: PersonRow & { notes: string | null };
  properties: Array<{ id: string; title: string; city: string | null; district: string | null }>;
  contracts: Array<{ id: string; startDate: string; rentKurus: number; status: string }>;
};

export function People({ initialQuery = "" }: { initialQuery?: string }) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", kind: "owner" });
  const [duplicate, setDuplicate] = useState<Duplicate["duplicate"] | null>(null);
  const [selected, setSelected] = useState<PersonDetail | null>(null);
  const [notes, setNotes] = useState<PersonNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [candidate, setCandidate] = useState({
    candidateStage: "",
    followUpDate: "",
    budgetText: "",
    wantsDistrict: "",
    wantsRoomCount: "",
  });
  const [permission, setPermission] = useState({ contactPermission: "unknown", note: "" });

  const load = useCallback(async (q: string) => {
    try {
      const data = await api<{ items: PersonRow[] }>(`/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setRows(data.items);
      setError(null);
    } catch {
      setError("Kişiler yüklenemedi");
    }
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
    void load(initialQuery);
  }, [load, initialQuery]);

  async function open(id: string) {
    try {
      const detail = await api<PersonDetail>(`/people/${id}`);
      setSelected(detail);
      setCandidate({
        candidateStage: detail.person.candidateStage ?? "",
        followUpDate: detail.person.followUpDate ?? "",
        budgetText: detail.person.budgetKurus === null ? "" : kurusToText(detail.person.budgetKurus),
        wantsDistrict: detail.person.wantsDistrict ?? "",
        wantsRoomCount: detail.person.wantsRoomCount ?? "",
      });
      setPermission({
        contactPermission: detail.person.contactPermission ?? "unknown",
        note: "",
      });
      setNotes((await api<{ items: PersonNote[] }>(`/people/${id}/notes`)).items);
      setError(null);
    } catch {
      setError("Kişi açılamadı");
    }
  }

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

  async function patchPerson(body: Record<string, unknown>) {
    if (!selected) return;
    setError(null);
    try {
      await api(`/people/${selected.person.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await open(selected.person.id);
      await load(query);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Güncellenemedi");
    }
  }

  async function addNote() {
    if (!selected || noteText.trim() === "") return;
    setError(null);
    try {
      await api(`/people/${selected.person.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteText }),
      });
      setNoteText("");
      await open(selected.person.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Not eklenemedi");
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Kişiler</h2>
      </div>
      <InfoNote title="Mal sahibi, kiracı ve aday aynı havuzda.">
        Aynı telefon veya aynı ad soyad girilince sistem uyarır; "yine de ekle" derseniz iki ayrı kayıt
        olur. Birleştirme kaydı <strong>silmez</strong>. Satırdaki <strong>iletişim izni</strong> KVKK
        içindir: "izin yok" işaretli kişiye pazarlama araması yapılmamalı. Adayın aşaması, takip
        tarihi, bütçesi ve görüşme notları satıra tıklayınca açılır.
      </InfoNote>

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
            <th>İletişim izni</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={selected?.person.id === row.id ? "selected" : "clickable"}
              onClick={() => void open(row.id)}
            >
              <td>{row.fullName}</td>
              <td className="muted">{row.phone ?? "—"}</td>
              <td>
                {KIND_TR[row.kind] ?? row.kind}
                {row.kind === "candidate" && row.candidateStage && (
                  <span className="muted small"> · {STAGE_TR[row.candidateStage] ?? row.candidateStage}</span>
                )}
              </td>
              <td onClick={(event) => event.stopPropagation()}>
                <select
                  value={row.contactPermission ?? "unknown"}
                  onChange={(e) =>
                    void patchPersonOf(row.id, { contactPermission: e.target.value })
                  }
                >
                  {Object.entries(PERMISSION_TR).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Kayıt yok.</p>}

      {selected && (
        <div className="panel">
          <BackButton onBack={() => setSelected(null)} label="Kişi listesine dön" />
          <div className="detail-head">
            <h3>{selected.person.fullName}</h3>
            <span className="badge">{KIND_TR[selected.person.kind] ?? selected.person.kind}</span>
            <span className={`chip ${selected.person.contactPermission === "denied" ? "danger" : selected.person.contactPermission === "allowed" ? "ok" : ""}`}>
              {PERMISSION_TR[selected.person.contactPermission] ?? selected.person.contactPermission}
            </span>
          </div>
          <p className="muted small">
            {selected.person.phone ?? "telefon yok"}
            {selected.person.email ? ` · ${selected.person.email}` : ""} ·{" "}
            {selected.properties.length} mülk · {selected.contracts.length} sözleşme
          </p>

          <h4>İletişim izni (KVKK)</h4>
          <div className="inline-form">
            <select
              value={permission.contactPermission}
              onChange={(e) => setPermission({ ...permission, contactPermission: e.target.value })}
            >
              {Object.entries(PERMISSION_TR).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              placeholder="Not (örn. SMS göndermeyin)"
              value={permission.note}
              onChange={(e) => setPermission({ ...permission, note: e.target.value })}
            />
            <button
              type="button"
              onClick={() =>
                void patchPerson({
                  contactPermission: permission.contactPermission,
                  ...(permission.note ? { contactPermissionNote: permission.note } : {}),
                })
              }
            >
              İzni kaydet
            </button>
          </div>

          {selected.person.kind === "candidate" && (
            <>
              <h4>Aday bilgisi</h4>
              <div className="inline-form">
                <select
                  value={candidate.candidateStage}
                  onChange={(e) => setCandidate({ ...candidate, candidateStage: e.target.value })}
                >
                  {Object.entries(STAGE_TR).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={candidate.followUpDate}
                  onChange={(e) => setCandidate({ ...candidate, followUpDate: e.target.value })}
                />
                <input
                  placeholder="Bütçe (örn. 5.000.000)"
                  value={candidate.budgetText}
                  onChange={(e) => setCandidate({ ...candidate, budgetText: e.target.value })}
                />
                <input
                  placeholder="İstediği ilçe"
                  value={candidate.wantsDistrict}
                  onChange={(e) => setCandidate({ ...candidate, wantsDistrict: e.target.value })}
                />
                <input
                  placeholder="Oda (2+1)"
                  value={candidate.wantsRoomCount}
                  onChange={(e) => setCandidate({ ...candidate, wantsRoomCount: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    void patchPerson({
                      candidateStage: candidate.candidateStage || null,
                      followUpDate: candidate.followUpDate || null,
                      budgetText: candidate.budgetText,
                      wantsDistrict: candidate.wantsDistrict || null,
                      wantsRoomCount: candidate.wantsRoomCount || null,
                    })
                  }
                >
                  Adayı kaydet
                </button>
              </div>
              <p className="hint">
                Takip tarihi geçen adaylar için hatırlatma modülü henüz yok (Y-54 kısmi).
              </p>
            </>
          )}

          <h4>Görüşme notları</h4>
          <ul className="doc-list">
            {notes.map((note) => (
              <li key={note.id}>
                <div>{note.body}</div>
                <div className="muted small">
                  {new Date(note.createdAt).toLocaleString("tr-TR")} · {note.author}
                </div>
              </li>
            ))}
            {notes.length === 0 && <li className="muted small">Henüz not yok.</li>}
          </ul>
          <div className="inline-form">
            <input
              placeholder="Görüşme notu"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <button type="button" disabled={noteText.trim() === ""} onClick={() => void addNote()}>
              Not ekle
            </button>
          </div>

          <div className="row-gap">
            <button type="button" className="ghost" onClick={() => setSelected(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /** Listenin kendi satırından izin değiştirirken detay panelini açmadan kaydeder. */
  async function patchPersonOf(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/people/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load(query);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Güncellenemedi");
    }
  }
}

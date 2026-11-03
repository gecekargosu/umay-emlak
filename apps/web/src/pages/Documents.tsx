import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type DocumentDetail,
  type DocumentRow,
  type KindOption,
  type PersonRow,
} from "../api";
import { InfoNote } from "../components/InfoNote";

/**
 * Belgeler — "raf" görünümü.
 * Belgeler türüne göre raflara ayrılır; bağı olmayanlar için sistem öneri
 * üretir, bağı yalnız yetkili onaylayınca kurulur (K-32).
 */
export function Documents({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [kinds, setKinds] = useState<KindOption[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("tapu");
  const [personId, setPersonId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (q: string) => {
    try {
      const data = await api<{ items: DocumentRow[] }>(
        `/documents${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
      setRows(data.items);
      setError(null);
    } catch {
      setError("Belgeler yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void load("");
    void api<{ items: KindOption[] }>("/documents/kinds")
      .then((data) => setKinds(data.items))
      .catch(() => null);
    void api<{ items: PersonRow[] }>("/people")
      .then((data) => setPeople(data.items))
      .catch(() => null);
  }, [load]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      if (personId) body.append("personId", personId);
      if (title.trim()) body.append("title", title.trim());
      const result = await api<{ id: string; duplicate: boolean; suggestions: number }>(
        "/documents",
        { method: "POST", body },
      );
      setMessage(
        result.duplicate
          ? "Bu dosya arşivde zaten vardı; ikinci kopya oluşturulmadı."
          : `Belge arşive girdi.${result.suggestions > 0 ? ` ${result.suggestions} eşleştirme önerisi var, aşağıdan onaylayın.` : ""}`,
      );
      setFile(null);
      setTitle("");
      await load(query);
      if (!result.duplicate) await open(result.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Belge yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    try {
      setDetail(await api<DocumentDetail>(`/documents/${id}`));
    } catch {
      setError("Belge açılamadı");
    }
  }

  async function decide(suggestionId: string, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api(`/documents/suggestions/${suggestionId}/${action}`, { method: "POST" });
      setMessage(action === "approve" ? "Bağ kuruldu." : "Öneri reddedildi.");
      if (detail) await open(detail.document.id);
      await load(query);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "İşlem yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  const groups = new Map<string, DocumentRow[]>();
  for (const row of rows ?? []) {
    const key = row.kindLabel;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div>
      <div className="page-head">
        <h2>Belgeler</h2>
      </div>
      <InfoNote title="Dosyalar içeriğiyle saklanır (sha256).">
        Aynı dosya iki kez yüklenirse <strong>tek kopya</strong> durur. Sistem yalnız eşleştirme
        <strong> önerir</strong>; belgeyi kişiye/mülke bağlamak yetkili onayı ister. Yükleme sırasında
        kişi seçmezsen öneri üretilir, aşağıdan onaylarsın.
      </InfoNote>

      <div className="toolbar">
        <input
          placeholder="Belge adı veya dosya adı ara"
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

      <div className="panel">
        <h3>Belge yükle</h3>
        <div className="inline-form">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Kişiye bağlama (öneri üretilsin)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <input
            placeholder="Belgeye ad ver (isteğe bağlı)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="button" disabled={!file || busy} onClick={() => void upload()}>
            {busy ? "Yükleniyor…" : "Yükle"}
          </button>
        </div>
        <p className="hint">En fazla 25 MB. PDF, JPG, PNG, WEBP, DOC/DOCX, TXT.</p>
      </div>

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}

      {rows === null && <p className="muted">Yükleniyor…</p>}
      {rows !== null && rows.length === 0 && <p className="muted">Rafta belge yok.</p>}

      {[...groups.entries()].map(([label, items]) => (
        <section key={label} className="shelf-group">
          <h3>
            {label} <span className="muted small">({items.length})</span>
          </h3>
          <div className="shelf">
            {items.map((row) => (
              <div key={row.id} className="doc-row">
                <button type="button" className="ghost" onClick={() => void open(row.id)}>
                  {row.title ?? row.filename}
                </button>
                <div className="muted small">
                  {row.personName ?? row.propertyTitle ?? "bağsız"}
                  {row.pendingSuggestions > 0 && (
                    <span className="badge">{row.pendingSuggestions} öneri</span>
                  )}
                </div>
                <a className="small" href={`/api/v1/documents/${row.id}/file`}>
                  indir
                </a>
              </div>
            ))}
          </div>
        </section>
      ))}

      {detail && (
        <div className="panel">
          <h3>{detail.document.title ?? detail.document.filename}</h3>
          <p className="muted small">
            {detail.document.kindLabel} · {(detail.document.sizeBytes / 1024).toFixed(0)} KB ·{" "}
            {new Date(detail.document.createdAt).toLocaleDateString("tr-TR")}
          </p>
          <div className="row-gap">
            <a className="small" href={`/api/v1/documents/${detail.document.id}/file`}>
              Dosyayı aç
            </a>
            <button type="button" className="ghost" onClick={() => setDetail(null)}>
              Kapat
            </button>
          </div>

          <h4>Eşleştirme</h4>
          {detail.suggestions.length === 0 && (
            <p className="muted">
              Bu belge için öneri yok. Kişiye bağlamak için yükleme sırasında kişi seçebilirsiniz.
            </p>
          )}
          <ul className="suggestion-list">
            {detail.suggestions.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.targetLabel}</strong>{" "}
                  <span className="muted small">
                    ({s.targetType === "person" ? "kişi" : "mülk"}) · güven {s.score}/100
                  </span>
                </div>
                <div className="muted small">{s.reasons.join(" · ")}</div>
                <div className="row-gap">
                  {s.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || !canApprove}
                        title={canApprove ? "" : "Onay yetkisi yalnız ofis sahibi/ortağında"}
                        onClick={() => void decide(s.id, "approve")}
                      >
                        Bağı kur
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void decide(s.id, "reject")}
                      >
                        Değil
                      </button>
                    </>
                  ) : (
                    <span className="muted small">
                      {s.status === "approved" ? "onaylandı" : "reddedildi"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!canApprove && (
            <p className="hint">Bağ kurma yetkisi olan bir kullanıcı (ofis sahibi/ortağı) onaylamalı.</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type DocumentDetail,
  type DocumentRow,
  type KindOption,
  type PersonRow,
} from "../api";
import { userError } from "../api";
import { InfoNote } from "../components/InfoNote";
import { BackButton } from "../components/BackButton";

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
  // TUR:24 — "karışık belgeler yüklendiğinde": birden çok dosya tek seferde seçilebilir
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      .catch((caught) => setError(userError(caught, "Belge türleri yüklenemedi")));
    void api<{ items: PersonRow[] }>("/people")
      .then((data) => setPeople(data.items))
      .catch((caught) => setError(userError(caught, "Kişi listesi yüklenemedi")));
  }, [load]);

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const lines: string[] = [];
    let lastId: string | null = null;
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", kind);
        if (personId) body.append("personId", personId);
        if (title.trim() && files.length === 1) body.append("title", title.trim());
        const result = await api<{
          id: string;
          duplicate: boolean;
          suggestions: number;
          linkedTo: string | null;
          linkedScore: number | null;
          createdPerson: string | null;
        }>("/documents", { method: "POST", body });

        if (result.duplicate) {
          lines.push(`${file.name}: arşivde vardı, ikinci kopya açılmadı.`);
        } else if (result.linkedTo) {
          lines.push(
            `${file.name}: “${result.linkedTo}” ile eşleşti${result.linkedScore ? ` (güven ${result.linkedScore}/100)` : ""}.`,
          );
        } else if (result.createdPerson) {
          lines.push(
            `${file.name}: eşleşme yok, “${result.createdPerson}” adıyla kişi kaydı açıldı.`,
          );
        } else {
          lines.push(`${file.name}: arşive girdi.`);
        }
        if (result.suggestions > 0) {
          lines.push(`${result.suggestions} belirsiz öneri var, aşağıdan onaylayın.`);
        }
        if (!result.duplicate) lastId = result.id;
      }
      setMessage(lines.join(" "));
      setFiles([]);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load(query);
      if (lastId) await open(lastId);
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
        Aynı dosya iki kez yüklenirse <strong>tek kopya</strong> durur. Karışık belgeleri tek seferde
        seçebilirsin (Ctrl ile çoklu seçim): dosya adı bir kişi veya mülkle <strong>net örtüşüyorsa
        bağ kendiliğinden kurulur</strong>; örtüşme yoksa dosya adıyla <strong>yeni kişi kaydı</strong>
        açılır. Belirsiz örtüşmede sistem yine yalnız öneri üretir, bağı yetkili onaylar.
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
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
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
          <button type="button" disabled={files.length === 0 || busy} onClick={() => void upload()}>
            {busy ? "Yükleniyor…" : files.length > 1 ? `Yükle (${files.length} dosya)` : "Yükle"}
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
          <BackButton onBack={() => setDetail(null)} label="Belge rafına dön" />
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

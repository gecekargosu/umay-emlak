import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  kurusToText,
  type KindOption,
  type ListingDetail,
  type ListingRow,
} from "../api";
import { InfoNote } from "../components/InfoNote";

const KIND_TR: Record<string, string> = { sale: "Satılık", rent: "Kiralık" };
const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

/** İzin verilen geçişler sunucudaki kuralla aynı; sunucu yine kendi kontrolünü yapar. */
const NEXT_STATUS: Record<string, Array<{ status: string; label: string }>> = {
  draft: [
    { status: "active", label: "Yayına al" },
    { status: "archived", label: "Arşivle" },
  ],
  active: [
    { status: "reserved", label: "Kaporalı" },
    { status: "closed", label: "Kapat" },
    { status: "archived", label: "Arşivle" },
  ],
  reserved: [
    { status: "active", label: "Kapora geri alındı" },
    { status: "closed", label: "Kapat" },
  ],
  closed: [{ status: "archived", label: "Arşivle" }],
  archived: [],
};

export function Listings({ canApprove }: { canApprove: boolean }) {
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [kinds, setKinds] = useState<KindOption[]>([]);
  const [priceText, setPriceText] = useState("");
  const [note, setNote] = useState("");
  const [docKind, setDocKind] = useState("tapu");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"raf" | "tablo">("raf");

  async function load() {
    try {
      const data = await api<{ items: ListingRow[] }>("/listings");
      setRows(data.items);
      setError(null);
    } catch {
      setError("Portföy yüklenemedi");
    }
  }

  useEffect(() => {
    void load();
    void api<{ items: KindOption[] }>("/documents/kinds")
      .then((data) => setKinds(data.items))
      .catch(() => null);
  }, []);

  async function open(id: string) {
    try {
      const data = await api<ListingDetail>(`/listings/${id}`);
      setDetail(data);
      setPriceText(kurusToText(data.listing.priceKurus));
      setNote("");
      setError(null);
    } catch {
      setError("İlan açılamadı");
    }
  }

  async function refresh() {
    await load();
    if (detail) await open(detail.listing.id);
  }

  async function changeStatus(status: string, force = false) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ forced: boolean }>(`/listings/${detail.listing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, force, note: note.trim() || undefined }),
      });
      setMessage(
        result.forced
          ? "Eksik belgeyle yayına alındı; bu karar durum geçmişine yazıldı."
          : `Durum güncellendi: ${STATUS_TR[status] ?? status}`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Durum değiştirilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function savePrice() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/listings/${detail.listing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ priceText, note: note.trim() || undefined }),
      });
      setMessage("Fiyat güncellendi ve geçmişe yazıldı.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Fiyat güncellenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc() {
    if (!detail || !file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", docKind);
      body.append("listingId", detail.listing.id);
      await api("/documents", { method: "POST", body });
      setFile(null);
      setMessage("Belge ilana eklendi.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Belge yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  if (error && !rows) return <div className="error">{error}</div>;
  if (!rows) return <p className="muted">Yükleniyor…</p>;

  return (
    <div>
      <div className="page-head">
        <h2>Portföy</h2>
        <span className="spacer" />
        <div className="toolbar" style={{ margin: 0 }}>
          <button
            type="button"
            className={view === "raf" ? "" : "ghost"}
            onClick={() => setView("raf")}
          >
            Raflar
          </button>
          <button
            type="button"
            className={view === "tablo" ? "" : "ghost"}
            onClick={() => setView("tablo")}
          >
            Tablo
          </button>
        </div>
      </div>
      <InfoNote title="İlan, mülkün ticari teklifidir.">
        Aynı daire hem satılık hem kiralık olabilir; bu yüzden ilan ayrı kayıttır. Taslak ilan,
        zorunlu belgeler (tapu, yetki, kimlik) tamamlanmadan <strong>yayına alınamaz</strong>.
        Raf görünümünde kartın üzerindeki kısaltma mülkün baş harfleridir; kapak fotoğrafı
        eklendiğinde buraya fotoğraf gelecek.
      </InfoNote>

      {rows.length === 0 ? (
        <p className="muted">
          Henüz portföy yok. Kişiler ekranından mal sahibi ekleyip içe aktarma yapabilirsiniz.
        </p>
      ) : view === "raf" ? (
        <Shelves
          rows={rows}
          selectedId={detail?.listing.id ?? null}
          onOpen={(id) => void open(id)}
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Mülk</th>
              <th>Konum</th>
              <th>Tür</th>
              <th>Durum</th>
              <th className="right">Fiyat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={detail?.listing.id === row.id ? "selected" : "clickable"}
                onClick={() => void open(row.id)}
              >
                <td>{row.title}</td>
                <td className="muted">{[row.district, row.city].filter(Boolean).join(", ")}</td>
                <td>{KIND_TR[row.kind] ?? row.kind}</td>
                <td>{STATUS_TR[row.status] ?? row.status}</td>
                <td className="right">{row.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}

      {detail && (
        <div className="panel">
          <div className="detail-head">
            <h3>{detail.property.title}</h3>
            <span className="badge">{STATUS_TR[detail.listing.status] ?? detail.listing.status}</span>
          </div>
          <p className="muted small">
            {[detail.property.district, detail.property.city].filter(Boolean).join(", ") || "konum yok"}
            {detail.property.roomCount ? ` · ${detail.property.roomCount}` : ""}
            {detail.property.grossM2 ? ` · ${detail.property.grossM2} m²` : ""}
            {detail.property.unitNo ? ` · daire ${detail.property.unitNo}` : ""}
            {detail.property.block ? ` · blok ${detail.property.block}` : ""}
          </p>

          <p>
            Mal sahibi:{" "}
            {detail.owners.length === 0
              ? "—"
              : detail.owners
                  .map((o) =>
                    o.shareBp ? `${o.fullName} (%${(o.shareBp / 100).toLocaleString("tr-TR")})` : o.fullName,
                  )
                  .join(", ")}
          </p>

          <h4>Belgeler</h4>
          <ul className="req-list">
            {detail.requirements.map((req) => (
              <li key={req.key} className={req.met ? "met" : "missing"}>
                {req.met ? "✓" : "—"} {req.label}
              </li>
            ))}
          </ul>
          {detail.documents.length > 0 ? (
            <ul className="doc-list">
              {detail.documents.map((doc) => (
                <li key={doc.id}>
                  <a href={`/api/v1/documents/${doc.id}/file`}>{doc.title ?? doc.filename}</a>{" "}
                  <span className="muted small">
                    {doc.kindLabel} · {new Date(doc.createdAt).toLocaleDateString("tr-TR")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">İlana bağlı belge yok.</p>
          )}

          <div className="inline-form">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <select value={docKind} onChange={(e) => setDocKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
            <button type="button" disabled={!file || busy} onClick={() => void uploadDoc()}>
              Belge ekle
            </button>
          </div>

          <h4>Fiyat</h4>
          <div className="inline-form">
            <input value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void savePrice()}>
              Fiyatı güncelle
            </button>
          </div>

          <h4>Durum</h4>
          <div className="inline-form">
            <input
              placeholder="Not (isteğe bağlı)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {(NEXT_STATUS[detail.listing.status] ?? []).map((next) => (
              <button
                key={next.status}
                type="button"
                className={next.status === "active" ? "" : "secondary"}
                disabled={busy}
                onClick={() => void changeStatus(next.status)}
              >
                {next.label}
              </button>
            ))}
            {detail.listing.status === "draft" && !detail.canPublish && canApprove && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void changeStatus("active", true)}
              >
                Eksik belgeyle zorla yayına al
              </button>
            )}
          </div>
          {!detail.canPublish && (
            <p className="hint">
              Yayına almak için eksik belgeler tamamlanmalı. Zorlama yalnız onay yetkisiyle yapılır ve
              kayda geçer.
            </p>
          )}

          {detail.priceHistory.length > 0 && (
            <>
              <h4>Fiyat geçmişi</h4>
              <ul className="small muted">
                {detail.priceHistory.map((p) => (
                  <li key={p.id}>
                    {new Date(p.createdAt).toLocaleDateString("tr-TR")}: {kurusToText(p.oldKurus)} →{" "}
                    {kurusToText(p.newKurus)}
                    {p.note ? ` · ${p.note}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {detail.statusHistory.length > 0 && (
            <>
              <h4>Durum geçmişi</h4>
              <ul className="small muted">
                {detail.statusHistory.map((s) => (
                  <li key={s.id}>
                    {new Date(s.createdAt).toLocaleDateString("tr-TR")}:{" "}
                    {STATUS_TR[s.fromStatus] ?? s.fromStatus} → {STATUS_TR[s.toStatus] ?? s.toStatus}
                    {s.forced ? " (belge zorlaması)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="row-gap">
            <button type="button" className="ghost" onClick={() => setDetail(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const CHIP: Record<string, string> = {
  draft: "warn",
  active: "ok",
  reserved: "info",
  closed: "",
  archived: "",
};

/** Raf görünümü — kaynak dosyadaki "mal sahibi dosyası" fikrinin ilk adımı. */
function Shelves({
  rows,
  selectedId,
  onOpen,
}: {
  rows: ListingRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const groups = [
    { key: "rent", label: "Kiralıklar", rows: rows.filter((r) => r.kind === "rent") },
    { key: "sale", label: "Satılıklar", rows: rows.filter((r) => r.kind === "sale") },
    { key: "draft", label: "Taslaklar", rows: rows.filter((r) => r.status === "draft") },
  ].filter((group) => group.rows.length > 0);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.key}>
          <div className="shelf-bar">
            <h3>{group.label}</h3>
            <span className="muted small">{group.rows.length} kayıt</span>
          </div>
          <div className="shelf">
            {group.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="shelf-card"
                style={selectedId === row.id ? { borderColor: "var(--accent)" } : undefined}
                onClick={() => onOpen(row.id)}
              >
                <div className="shelf-cover">
                  {row.title
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toLocaleUpperCase("tr"))
                    .join("")}
                </div>
                <div className="shelf-body">
                  <div className="shelf-title">{row.title}</div>
                  <div className="shelf-meta">
                    {[row.district, row.city].filter(Boolean).join(", ") || "konum yok"}
                  </div>
                  <div className="shelf-price">{row.price}</div>
                  <span className={`chip ${CHIP[row.status] ?? ""}`}>
                    {STATUS_TR[row.status] ?? row.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

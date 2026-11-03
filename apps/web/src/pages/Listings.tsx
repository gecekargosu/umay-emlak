import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  kurusToText,
  type KindOption,
  type ListingDetail,
  type ListingRow,
  type PropertyAssets,
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
  const [allRows, setAllRows] = useState<ListingRow[]>([]);
  const [filters, setFilters] = useState({ q: "", kind: "", status: "" });
  const [authority, setAuthority] = useState("");
  const [assets, setAssets] = useState<PropertyAssets | null>(null);
  const [subForm, setSubForm] = useState({ kind: "elektrik", provider: "", monthlyText: "" });
  const [fixtureForm, setFixtureForm] = useState({ name: "", quantity: 1 });  async function load(params: { q?: string; kind?: string; status?: string } = {}) {
    try {
      const search = new URLSearchParams();
      if (params.q) search.set("q", params.q);
      if (params.kind) search.set("kind", params.kind);
      if (params.status) search.set("status", params.status);
      const qs = search.toString();
      const data = await api<{ items: ListingRow[] }>(`/listings${qs ? `?${qs}` : ""}`);
      setRows(data.items);
      setError(null);
    } catch {
      setError("Portföy yüklenemedi");
    }
  }

  /** Raflar filtreden bağımsızdır: kiralıklar ve satılıklar hep tam listelenir. */
  async function loadAll() {
    try {
      const data = await api<{ items: ListingRow[] }>("/listings");
      setAllRows(data.items);
    } catch {
      // raf boş kalır, liste hatayı gösterir
    }
  }

  useEffect(() => {
    void load();
    void loadAll();
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
      setAuthority(data.listing.authorityNo ?? "");
      void api<PropertyAssets>(`/properties/${data.listing.propertyId}/assets`)
        .then(setAssets)
        .catch(() => setAssets(null));
      setError(null);
    } catch {
      setError("İlan açılamadı");
    }
  }

  async function refresh() {
    await Promise.all([load(filters), loadAll()]);
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

  /** Y-60: yetki numarası — kayıt alanı, resmî doğrulama değil. */
  async function saveAuthority() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/listings/${detail.listing.id}/authority`, {
        method: "PATCH",
        body: JSON.stringify({ authorityNo: authority.trim() || null }),
      });
      setMessage("Yetki numarası kaydedildi. Bu bir kayıttır, resmî doğrulama değildir.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  /** Y-55: mülk aboneliği / demirbaş — kayıt amaçlı, ödeme yapılmaz. */
  async function addSubscription() {
    if (!detail || subForm.kind.trim() === "") return;
    setBusy(true);
    try {
      await api(`/properties/${detail.listing.propertyId}/subscriptions`, {
        method: "POST",
        body: JSON.stringify({
          kind: subForm.kind,
          provider: subForm.provider || undefined,
          monthlyText: subForm.monthlyText || undefined,
        }),
      });
      setSubForm({ kind: "elektrik", provider: "", monthlyText: "" });
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Abonelik eklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function addFixture() {
    if (!detail || fixtureForm.name.trim() === "") return;
    setBusy(true);
    try {
      await api(`/properties/${detail.listing.propertyId}/fixtures`, {
        method: "POST",
        body: JSON.stringify({ name: fixtureForm.name, quantity: Number(fixtureForm.quantity) || 1 }),
      });
      setFixtureForm({ name: "", quantity: 1 });
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Demirbaş eklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(path: string) {
    setBusy(true);
    try {
      await api(path, { method: "DELETE" });
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Silinemedi");
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
        <span className="muted small">{rows.length} kayıt</span>
      </div>
      <InfoNote title="İlan, mülkün ticari teklifidir.">
        Aynı daire hem satılık hem kiralık olabilir; bu yüzden ilan ayrı kayıttır. Taslak ilan,
        zorunlu belgeler (tapu, yetki, kimlik) tamamlanmadan <strong>yayına alınamaz</strong>.
        Raf görünümünde kartın üzerindeki kısaltma mülkün baş harfleridir; kapak fotoğrafı
        eklendiğinde buraya fotoğraf gelecek.
      </InfoNote>

      <Shelf
        title="Kiralıklar"
        rows={allRows.filter((row) => row.kind === "rent")}
        selectedId={detail?.listing.id ?? null}
        onOpen={(id) => void open(id)}
      />
      <Shelf
        title="Satılıklar"
        rows={allRows.filter((row) => row.kind === "sale")}
        selectedId={detail?.listing.id ?? null}
        onOpen={(id) => void open(id)}
      />

      <h3 style={{ marginTop: 22 }}>Tüm portföy</h3>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load(filters);
        }}
      >
        <input
          style={{ flex: "1 1 300px" }}
          placeholder="Adres, daire, mal sahibi veya kiracı ara…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select
          value={filters.kind}
          onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
        >
          <option value="">Kiralık + satılık</option>
          <option value="rent">Yalnız kiralık</option>
          <option value="sale">Yalnız satılık</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Tüm durumlar</option>
          <option value="draft">Taslak</option>
          <option value="active">Aktif</option>
          <option value="reserved">Kaporalı</option>
          <option value="closed">Kapandı</option>
          <option value="archived">Arşiv</option>
        </select>
        <button type="submit">Ara</button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const empty = { q: "", kind: "", status: "" };
            setFilters(empty);
            void load(empty);
          }}
        >
          Temizle
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="muted">
          {allRows.length === 0
            ? "Henüz portföy yok. Kişiler ekranından mal sahibi ekleyip içe aktarma yapabilirsiniz."
            : "Bu aramaya uyan kayıt yok. Filtreleri temizleyin."}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Mülk</th>
              <th>Adres</th>
              <th>Mal sahibi</th>
              <th>Kiracı</th>
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
                <td>
                  {row.title}
                  {row.roomCount ? <span className="muted small"> · {row.roomCount}</span> : null}
                </td>
                <td className="muted">
                  {row.address ||
                    [row.district, row.city].filter(Boolean).join(", ") ||
                    "adres yok"}
                </td>
                <td className="muted">{row.ownerName ?? "—"}</td>
                <td className="muted">{row.tenantName ?? "—"}</td>
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

          <h4>EİDS / ilan yetki numarası</h4>
          <div className="inline-form">
            <input
              placeholder="Örn. 3400123456"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
            />
            <button type="button" disabled={busy} onClick={() => void saveAuthority()}>
              Kaydet
            </button>
          </div>
          <p className="hint">
            Bu alan yalnız kayıttır; program yetki numarasını resmî olarak doğrulamaz.
          </p>

          <h4>Abonelikler ve demirbaş</h4>
          {assets === null ? (
            <p className="muted small">Yüklenemedi.</p>
          ) : (
            <>
              <ul className="doc-list">
                {assets.subscriptions.map((sub) => (
                  <li key={sub.id}>
                    <strong>{sub.kind}</strong>
                    {sub.provider ? ` · ${sub.provider}` : ""}
                    {sub.monthly ? ` · aylık ${sub.monthly}` : ""}
                    <button
                      type="button"
                      className="ghost"
                      style={{ marginLeft: 10 }}
                      disabled={busy}
                      onClick={() =>
                        void removeAsset(
                          `/properties/${detail.listing.propertyId}/subscriptions/${sub.id}`,
                        )
                      }
                    >
                      Sil
                    </button>
                  </li>
                ))}
                {assets.fixtures.map((fixture) => (
                  <li key={fixture.id}>
                    <strong>{fixture.name}</strong> · {fixture.quantity} adet
                    <button
                      type="button"
                      className="ghost"
                      style={{ marginLeft: 10 }}
                      disabled={busy}
                      onClick={() =>
                        void removeAsset(`/properties/${detail.listing.propertyId}/fixtures/${fixture.id}`)
                      }
                    >
                      Sil
                    </button>
                  </li>
                ))}
                {assets.subscriptions.length === 0 && assets.fixtures.length === 0 && (
                  <li className="muted small">Kayıt yok.</li>
                )}
              </ul>

              <div className="inline-form">
                <select
                  value={subForm.kind}
                  onChange={(e) => setSubForm({ ...subForm, kind: e.target.value })}
                >
                  <option value="elektrik">Elektrik</option>
                  <option value="su">Su</option>
                  <option value="dogalgaz">Doğalgaz</option>
                  <option value="internet">İnternet</option>
                  <option value="aidat">Aidat</option>
                  <option value="diger">Diğer</option>
                </select>
                <input
                  placeholder="Kurum"
                  value={subForm.provider}
                  onChange={(e) => setSubForm({ ...subForm, provider: e.target.value })}
                />
                <input
                  placeholder="Aylık (örn. 450)"
                  value={subForm.monthlyText}
                  onChange={(e) => setSubForm({ ...subForm, monthlyText: e.target.value })}
                />
                <button type="button" disabled={busy} onClick={() => void addSubscription()}>
                  Abonelik ekle
                </button>
              </div>

              <div className="inline-form">
                <input
                  placeholder="Demirbaş (klima, kombi…)"
                  value={fixtureForm.name}
                  onChange={(e) => setFixtureForm({ ...fixtureForm, name: e.target.value })}
                />
                <input
                  type="number"
                  min={1}
                  value={fixtureForm.quantity}
                  onChange={(e) =>
                    setFixtureForm({ ...fixtureForm, quantity: Number(e.target.value) })
                  }
                />
                <button type="button" disabled={busy} onClick={() => void addFixture()}>
                  Demirbaş ekle
                </button>
              </div>
              <p className="hint">
                Bu liste bilgi amaçlıdır; program abonelik ödemesi yapmaz, tahsilat kaydı açmaz.
              </p>
            </>
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

/** Raf görünümü: kiralıklar / satılıklar. Kart tıklanınca ilan detayı açılır. */
function Shelf({
  title,
  rows,
  selectedId,
  onOpen,
}: {
  title: string;
  rows: ListingRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <div className="shelf-bar">
        <h3>{title}</h3>
        <span className="muted small">{rows.length} kayıt</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Bu rafta kayıt yok.</p>
      ) : (
        <div className="shelf">
          {rows.map((row) => (
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
      )}
    </section>
  );
}

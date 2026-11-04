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
import { logOnly, userError } from "../api";
import { InfoNote } from "../components/InfoNote";
import { KIND_TR, STATUS_TR } from "../components/listing-labels";
import { Shelf } from "../components/ListingShelf";
import { ListingFilters, EMPTY_FILTERS, type Filters } from "../components/ListingFilters";
import { ListingDetailPage } from "../components/ListingDetailPage";
import { VirtualTable } from "../components/VirtualTable";

/** İzin verilen geçişler sunucudaki kuralla aynı; sunucu yine kendi kontrolünü yapar. */



export function Listings({
  canApprove,
  /** TUR:24 — "Satılıklar" ve "Kiralıklar" ayrı ekranı: tür sabitlenir, filtreden kaldırılır. */
  fixedKind,
}: {
  canApprove: boolean;
  fixedKind?: "sale" | "rent";
}) {
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
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    kind: fixedKind ?? "",
  });
  const [authority, setAuthority] = useState("");
  const [assets, setAssets] = useState<PropertyAssets | null>(null);
  const [subForm, setSubForm] = useState({ kind: "elektrik", provider: "", monthlyText: "" });
  const [fixtureForm, setFixtureForm] = useState({ name: "", quantity: 1 });  async function load(params: Partial<Filters> = {}) {
    try {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string" && value.trim() !== "") search.set(key, value.trim());
      }
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
    } catch (caught) {
      // Raflar boş kalmasın: kullanıcıya sebep söylenir, ayrıntı log'a gider.
      setError(userError(caught, "Raflar yüklenemedi"));
    }
  }

  const [districts, setDistricts] = useState<string[]>([]);

  useEffect(() => {
    void loadAll();
    void api<{ items: KindOption[] }>("/documents/kinds")
      .then((data) => setKinds(data.items))
      .catch((caught) => setError(userError(caught, "Belge türleri yüklenemedi")));
    void api<{ items: string[] }>("/listings/districts")
      .then((data) => setDistricts(data.items))
      .catch((caught) => setError(userError(caught, "İlçe listesi yüklenemedi")));
  }, []);

  /** TUR:21 — filtre yazarken kendiliğinden çalışır; "Filtrele"ye basmak gerekmez. */
  useEffect(() => {
    const timer = setTimeout(() => {
      void load(filters);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function open(id: string) {
    try {
      const data = await api<ListingDetail>(`/listings/${id}`);
      setDetail(data);
      // Mülk dosyası yeni sayfa gibi açılır: kaydırma en üste alınır.
      window.scrollTo(0, 0);
      setPriceText(kurusToText(data.listing.priceKurus));
      setNote("");
      setAuthority(data.listing.authorityNo ?? "");
      void api<PropertyAssets>(`/properties/${data.listing.propertyId}/assets`)
        .then(setAssets)
        .catch((caught) => {
          logOnly(caught, "mülk demirbaş/abonelik bilgisi alınamadı");
          setAssets(null);
        });
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

  // Liste gizlenirken TS `detail`i null'a daraltıyor; seçili kimliği ayrı tutuyoruz.
  const selectedListingId = detail ? detail.listing.id : null;
  if (!rows) return <p className="muted">Yükleniyor…</p>;

  return (
    <div>
      {/* TUR:27 — kullanıcı isteği: "karta tıkladım, bir şey açılmadı". Detay artık
          listenin altında değil: liste tamamen gizlenir, mülk dosyası tam sayfa açılır. */}
      {!detail && (
        <>
      <div className="page-head">
        <h2>{fixedKind === "sale" ? "Satılıklar" : fixedKind === "rent" ? "Kiralıklar" : "Portföy"}</h2>
        <span className="spacer" />
        <span className="muted small">{rows.length} ilan</span>
      </div>
      <InfoNote title="İlan, mülkün ticari teklifidir.">
        Aynı daire hem satılık hem kiralık olabilir; bu yüzden ilan ayrı kayıttır. Taslak ilan,
        zorunlu belgeler (tapu, yetki, kimlik) tamamlanmadan <strong>yayına alınamaz</strong>.
        Raf görünümünde kartın üzerinde mülkün <strong>kapak fotoğrafı</strong> görünür; fotoğrafı
        olmayan kayıtta baş harfler yazar. Fotoğrafı mülk dosyasından ekleyip değiştirebilirsin.
      </InfoNote>

      {fixedKind !== "rent" && (
        <Shelf
          title="Satılıklar"
          rows={allRows.filter((row) => row.kind === "sale")}
          selectedId={selectedListingId}
          onOpen={(id) => void open(id)}
        />
      )}
      {fixedKind !== "sale" && (
        <Shelf
          title="Kiralıklar"
          rows={allRows.filter((row) => row.kind === "rent")}
          selectedId={selectedListingId}
          onOpen={(id) => void open(id)}
        />
      )}

      {/* TUR:28 — kullanıcı isteği: "kiralıklar olmadı, neden liste yapıyorsun?".
          Satılıklar ve Kiralıklar ekranlarında yalnız raflar var; liste/filtre
          yalnızca geniş "Gayrimenkuller" ekranında kalır. */}
      {!fixedKind && (
        <>
      <h3 style={{ marginTop: 22 }}>Tüm gayrimenkuller</h3>
      <p className="muted small" style={{ marginTop: -6 }}>
        Raflar vitrin (ilk 10 kayıt); arama ve filtreler aşağıdaki listede çalışır, liste
        aşağı yukarı kaydırılabilir.
      </p>
      <ListingFilters
        filters={filters}
        setFilters={setFilters}
        districts={districts}
        onSubmit={() => void load(filters)}
        onClear={() => {
          const cleared = { ...EMPTY_FILTERS, kind: fixedKind ?? "" };
          setFilters(cleared);
          void load(cleared);
        }}
      />

      {rows.length === 0 ? (
        <p className="muted">
          {allRows.length === 0
            ? "Henüz portföy yok. Kişiler ekranından mal sahibi ekleyip içe aktarma yapabilirsiniz."
            : "Bu aramaya uyan kayıt yok. Filtreleri temizleyin."}
        </p>
      ) : (                <VirtualTable
          rows={rows}
          columns={9}
          head={
            <tr>
              <th>Mülk</th>
              <th>Adres</th>
              <th>Site / Apartman</th>
              <th>Daire</th>
              <th>Mal sahibi</th>
              <th>Kiracı</th>
              <th>Tür</th>
              <th>Durum</th>
              <th className="right">Fiyat</th>
            </tr>
          }
          renderRow={(row) => (
            <tr
              key={row.id}
              className={selectedListingId === row.id ? "selected" : "clickable"}
              onClick={() => void open(row.id)}
            >
              <td>
                {row.title}
                {row.roomCount ? <span className="muted small"> · {row.roomCount}</span> : null}
              </td>
              <td className="muted">
                {row.address || [row.district, row.city].filter(Boolean).join(", ") || "adres yok"}
              </td>
              <td className="muted">
                {[row.siteName, row.buildingName].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="muted">
                {row.unitNo ?? "—"}
                {row.block ? <span className="small"> / {row.block}</span> : null}
              </td>
              <td className="muted">{row.ownerName ?? "—"}</td>
              <td className="muted">{row.tenantName ?? "—"}</td>
              <td>{KIND_TR[row.kind] ?? row.kind}</td>
              <td>{STATUS_TR[row.status] ?? row.status}</td>
              <td className="right">{row.price}</td>
            </tr>
          )}
        />
      )}
        </>
      )}
        </>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}

      {detail && (
        <ListingDetailPage
          detail={detail}
          canApprove={canApprove}
          kinds={kinds}
          file={file}
          setFile={setFile}
          docKind={docKind}
          setDocKind={setDocKind}
          busy={busy}
          priceText={priceText}
          setPriceText={setPriceText}
          note={note}
          setNote={setNote}
          authority={authority}
          setAuthority={setAuthority}
          assets={assets}
          subForm={subForm}
          setSubForm={setSubForm}
          fixtureForm={fixtureForm}
          setFixtureForm={setFixtureForm}
          onRefresh={() => void refresh()}
          onUploadDoc={() => void uploadDoc()}
          onSavePrice={() => void savePrice()}
          onChangeStatus={(status, forced) => void changeStatus(status, forced)}
          onSaveAuthority={() => void saveAuthority()}
          onAddSubscription={() => void addSubscription()}
          onAddFixture={() => void addFixture()}
          onRemoveAsset={(path) => void removeAsset(path)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

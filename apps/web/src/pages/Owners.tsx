import { useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  type OwnerDetail,
  type OwnerProperty,
  type OwnerRow,
  type TenantDetail,
  type TenantRow,
} from "../api";
import { BackButton } from "../components/BackButton";
import { InfoNote } from "../components/InfoNote";

const KIND_TR: Record<string, string> = { sale: "Satılık", rent: "Kiralık" };
const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};
const CONTRACT_TR: Record<string, string> = {
  active: "Aktif kiracılık",
  ended: "Bitmiş kiracılık",
  cancelled: "İptal edilmiş",
};
const TYPE_TR: Record<string, string> = {
  apartment: "Daire",
  house: "Müstakil ev",
  land: "Arsa",
  shop: "Dükkan",
  office: "Ofis",
};
const CHARGE_TR: Record<string, string> = {
  open: "Açık",
  partial: "Kısmi",
  paid: "Ödendi",
  cancelled: "İptal",
};

function initials(name: string): string {
  return name
    .replace(/^DEMO\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr"))
    .join("");
}

function digits(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

type Row = {
  id: string;
  type: "owner" | "tenant";
  fullName: string;
  phone: string | null;
  meta: string;
  count: string;
  debtKurus: number;
  debtText: string;
};

/**
 * Mal sahipleri + kiracılar (TUR:22).
 * Üstte iki raf: mal sahipleri ve kiracılar — ikisi de yatay kaydırılır,
 * içinde isimler alfabetik sıralı. Altında filtre + tek liste; kart ya da
 * satır tıklanınca kişinin dosyası açılır.
 */
export function Owners() {
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [filters, setFilters] = useState({ q: "", kind: "all", onlyDebt: false });
  const [ownerDetail, setOwnerDetail] = useState<OwnerDetail | null>(null);
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<{ items: OwnerRow[] }>("/owners"),
      api<{ items: TenantRow[] }>("/tenants"),
    ])
      .then(([ownerData, tenantData]) => {
        setOwners(ownerData.items);
        setTenants(tenantData.items);
        setError(null);
      })
      .catch(() => setError("Kişiler yüklenemedi"));
  }, []);

  async function openOwner(id: string) {
    try {
      setOwnerDetail(await api<OwnerDetail>(`/owners/${id}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Mal sahibi açılamadı");
    }
  }

  async function openTenant(id: string) {
    try {
      setTenantDetail(await api<TenantDetail>(`/tenants/${id}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Kiracı açılamadı");
    }
  }

  const sortedOwners = useMemo(
    () => [...(owners ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, "tr")),
    [owners],
  );
  const sortedTenants = useMemo(
    () => [...(tenants ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, "tr")),
    [tenants],
  );

  const rows = useMemo<Row[]>(() => {
    const q = filters.q.trim().toLocaleLowerCase("tr");
    const qDigits = digits(filters.q);
    const match = (name: string, phone: string | null) =>
      q === "" ||
      name.toLocaleLowerCase("tr").includes(q) ||
      (qDigits.length >= 3 && digits(phone).includes(qDigits));

    const ownerRows: Row[] = sortedOwners.map((owner) => ({
      id: owner.id,
      type: "owner",
      fullName: owner.fullName,
      phone: owner.phone,
      meta: `${owner.propertyCount} mülk · ${owner.saleCount} satılık · ${owner.rentCount} kiralık`,
      count: String(owner.propertyCount),
      debtKurus: owner.openKurus,
      debtText: owner.openText,
    }));

    const tenantRows: Row[] = sortedTenants.map((tenant) => ({
      id: tenant.id,
      type: "tenant",
      fullName: tenant.fullName,
      phone: tenant.phone,
      meta: tenant.propertyTitle
        ? `${tenant.propertyTitle}${tenant.unitNo ? ` · daire ${tenant.unitNo}` : ""} · kira ${tenant.rentText ?? "—"}`
        : "aktif kiracılık yok",
      count: tenant.propertyTitle ?? "—",
      debtKurus: tenant.openKurus,
      debtText: tenant.openText,
    }));

    return [...ownerRows, ...tenantRows]
      .filter((row) => (filters.kind === "all" ? true : row.type === filters.kind))
      .filter((row) => (filters.onlyDebt ? row.debtKurus > 0 : true))
      .filter((row) => match(row.fullName, row.phone))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
  }, [sortedOwners, sortedTenants, filters]);

  if (ownerDetail) {
    return <OwnerFolder detail={ownerDetail} onBack={() => setOwnerDetail(null)} />;
  }
  if (tenantDetail) {
    return <TenantFolder detail={tenantDetail} onBack={() => setTenantDetail(null)} />;
  }

  return (
    <div>
      <div className="page-head">
        <h2>Mal sahipleri / kiracılar</h2>
        <span className="spacer" />
        <span className="muted small">
          {(owners?.length ?? 0)} mal sahibi · {(tenants?.length ?? 0)} kiracı
        </span>
      </div>

      <InfoNote title="İki raf, tek kişi kaydı.">
        Üstteki iki raf yatay kaydırılır; içindeki isimler alfabetik sıralıdır. Bir karta ya da
        alttaki listede bir satıra tıklayınca kişinin dosyası açılır: mal sahibinde mülkleri,
        kiracıda oturduğu daire, sözleşme, kira ve ödeme dökümü. Kiracı bilgisi ayrı
        tutulmaz — mal sahibi dosyasındaki kiracı ile buradaki kiracı aynı kayıttır.
      </InfoNote>

      <ShelfBar title="Mal sahipleri" count={sortedOwners.length} />
      {owners === null ? (
        <p className="muted small">Yükleniyor…</p>
      ) : sortedOwners.length === 0 ? (
        <p className="muted small">Bu rafta mal sahibi yok.</p>
      ) : (
        <div className="shelf">
          {sortedOwners.map((owner) => (
            <button
              key={owner.id}
              type="button"
              className="owner-card"
              onClick={() => void openOwner(owner.id)}
              title={`${owner.fullName} — ${owner.propertyCount} mülk`}
            >
              <span className="owner-avatar">{initials(owner.fullName)}</span>
              <span className="owner-name">{owner.fullName}</span>
              <span className="muted small">{owner.phone ?? "telefon yok"}</span>
              <span className="owner-facts">
                <strong>{owner.propertyCount}</strong> mülk · {owner.saleCount} satılık ·{" "}
                {owner.rentCount} kiralık
              </span>
              <span className="owner-value">{owner.saleText}</span>
              {owner.openKurus > 0 && <span className="chip warn">{owner.openText} açık</span>}
            </button>
          ))}
        </div>
      )}

      <ShelfBar title="Kiracılar" count={sortedTenants.length} />
      {tenants === null ? (
        <p className="muted small">Yükleniyor…</p>
      ) : sortedTenants.length === 0 ? (
        <p className="muted small">Bu rafta kiracı yok.</p>
      ) : (
        <div className="shelf">
          {sortedTenants.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              className="owner-card tenant-card"
              onClick={() => void openTenant(tenant.id)}
              title={`${tenant.fullName} — ${tenant.propertyTitle ?? "kiracılık yok"}`}
            >
              <span className="owner-avatar">{initials(tenant.fullName)}</span>
              <span className="owner-name">{tenant.fullName}</span>
              <span className="muted small">{tenant.phone ?? "telefon yok"}</span>
              <span className="owner-facts">
                {tenant.propertyTitle
                  ? `${tenant.propertyTitle}${tenant.unitNo ? ` · daire ${tenant.unitNo}` : ""}`
                  : "aktif kiracılık yok"}
              </span>
              <span className="owner-value">{tenant.rentText ?? "—"}</span>
              {tenant.overdueCount > 0 ? (
                <span className="chip warn">{tenant.overdueCount} gecikmiş taksit</span>
              ) : tenant.openKurus > 0 ? (
                <span className="chip info">{tenant.openText} açık</span>
              ) : (
                <span className="chip ok">borç yok</span>
              )}
            </button>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>Filtrele ve listele</h3>
      <form className="filter-panel" onSubmit={(event) => event.preventDefault()}>
        <div className="filter-grid">
          <label>
            Ad soyad / telefon
            <input
              placeholder="yazarken süzer"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </label>
          <label>
            Kim?
            <select
              value={filters.kind}
              onChange={(event) => setFilters({ ...filters, kind: event.target.value })}
            >
              <option value="all">Mal sahibi + kiracı</option>
              <option value="owner">Yalnız mal sahibi</option>
              <option value="tenant">Yalnız kiracı</option>
            </select>
          </label>
          <label>
            Borç
            <select
              value={filters.onlyDebt ? "debt" : "all"}
              onChange={(event) =>
                setFilters({ ...filters, onlyDebt: event.target.value === "debt" })
              }
            >
              <option value="all">Tümü</option>
              <option value="debt">Yalnız borçlu</option>
            </select>
          </label>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <span className="muted small">{rows.length} kişi listeleniyor</span>
          <button
            type="button"
            className="ghost"
            onClick={() => setFilters({ q: "", kind: "all", onlyDebt: false })}
          >
            Temizle
          </button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      {rows.length === 0 ? (
        <p className="muted">Bu filtreye uyan kişi yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ad soyad</th>
                <th>Kim</th>
                <th>Telefon</th>
                <th>Mülk / kiracılık</th>
                <th className="right">Açık borç</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.type}-${row.id}`}
                  className="clickable"
                  onClick={() =>
                    row.type === "owner" ? void openOwner(row.id) : void openTenant(row.id)
                  }
                >
                  <td>{row.fullName}</td>
                  <td>
                    <span className={`chip ${row.type === "owner" ? "info" : "ok"}`}>
                      {row.type === "owner" ? "Mal sahibi" : "Kiracı"}
                    </span>
                  </td>
                  <td className="muted">{row.phone ?? "—"}</td>
                  <td className="muted">{row.meta}</td>
                  <td className="right">{row.debtKurus > 0 ? row.debtText : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShelfBar({ title, count }: { title: string; count: number }) {
  return (
    <div className="shelf-bar">
      <h3>{title}</h3>
      <span className="muted small">{count} kayıt</span>
    </div>
  );
}

function OwnerFolder({ detail, onBack }: { detail: OwnerDetail; onBack: () => void }) {
  const { person, properties } = detail;
  const sales = properties.filter((property) => property.kind === "sale");
  const rents = properties.filter((property) => property.kind === "rent");
  const tenantCount = new Set(properties.map((property) => property.tenantName).filter(Boolean)).size;

  return (
    <div>
      <div className="page-head">
        <BackButton onBack={onBack} label="Mal sahipleri / kiracılar" />
        <h2 style={{ marginLeft: 8 }}>{person.fullName}</h2>
        <span className="spacer" />
        <span className="muted small">{person.propertyCount} mülk</span>
      </div>

      <p className="muted small">
        {person.phone ?? "telefon yok"} · {person.email ?? "e-posta yok"} ·{" "}
        {person.createdAt ? new Date(person.createdAt).toLocaleDateString("tr-TR") : "kayıt yok"}
      </p>

      <div className="cards">
        <div className="card">
          <div className="card-label">Mülk</div>
          <div className="card-value">{person.propertyCount}</div>
          <div className="muted small">
            {sales.length} satılık · {rents.length} kiralık ilan
          </div>
        </div>
        <div className="card">
          <div className="card-label">Portföy değeri (aktif ilanlar)</div>
          <div className="card-value">{person.portfolioText}</div>
        </div>
        <div className="card">
          <div className="card-label">Aylık kira (aktif sözleşme)</div>
          <div className="card-value">{person.monthlyRentText}</div>
          <div className="muted small">{tenantCount} kiracı</div>
        </div>
        <div className={`card${person.openKurus > 0 ? " card-emphasis" : ""}`}>
          <div className="card-label">Açık borç</div>
          <div className="card-value">{person.openText}</div>
        </div>
      </div>

      {person.notes && <p className="muted small">Not: {person.notes}</p>}

      <Section title="Satılıklar" count={sales.length} />
      <PropertyRail rows={sales} />
      <Section title="Kiralıklar" count={rents.length} />
      <PropertyRail rows={rents} />

      <h3 style={{ marginTop: 22 }}>Tüm mülkler</h3>
      {properties.length === 0 ? (
        <p className="muted">Bu sahibin kayıtlı mülkü yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mülk</th>
                <th>Adres</th>
                <th>Site / Apartman</th>
                <th>Daire</th>
                <th>Oda / m² / kat</th>
                <th>İlan</th>
                <th>Fiyat</th>
                <th>Kiracı</th>
                <th>Kira</th>
                <th className="right">Açık</th>
                <th className="right">Belge</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => (
                <tr key={`${property.id}-${property.kind ?? "none"}`}>
                  <td>
                    {property.title}
                    <span className="muted small"> · {TYPE_TR[property.type] ?? property.type}</span>
                  </td>
                  <td className="muted">{property.address ?? "—"}</td>
                  <td className="muted">
                    {[property.siteName, property.buildingName].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="muted">
                    {property.unitNo ?? "—"}
                    {property.block ? <span className="small"> / {property.block}</span> : null}
                  </td>
                  <td className="muted">
                    {[property.roomCount, property.grossM2 ? `${property.grossM2} m²` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td>
                    {property.kind ? (KIND_TR[property.kind] ?? property.kind) : "ilansız"}
                    <span className="muted small">
                      {" "}
                      {property.status ? (STATUS_TR[property.status] ?? property.status) : ""}
                    </span>
                  </td>
                  <td className="right">{property.priceText ?? "—"}</td>
                  <td className="muted">
                    {property.tenantName ?? "—"}
                    {property.dueDay ? <span className="small"> · gün {property.dueDay}</span> : null}
                  </td>
                  <td className="right">{property.rentText ?? "—"}</td>
                  <td className="right">{property.openKurus > 0 ? property.openText : "—"}</td>
                  <td className="right">{property.documentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TenantFolder({ detail, onBack }: { detail: TenantDetail; onBack: () => void }) {
  const active = detail.contracts.find((contract) => contract.status === "active");
  const past = detail.contracts.filter((contract) => contract.status !== "active");

  return (
    <div>
      <div className="page-head">
        <BackButton onBack={onBack} label="Mal sahipleri / kiracılar" />
        <h2 style={{ marginLeft: 8 }}>{detail.person.fullName}</h2>
        <span className="spacer" />
        <span className="muted small">
          {active ? "aktif kiracı" : "aktif kiracılık yok"}
        </span>
      </div>

      <p className="muted small">
        {detail.person.phone ?? "telefon yok"} · {detail.person.email ?? "e-posta yok"}
        {detail.person.contactPermission === "denied" ? " · iletişim izni yok" : ""}
      </p>

      <div className="cards">
        <div className="card">
          <div className="card-label">Aylık kira</div>
          <div className="card-value">{active?.rentText ?? "—"}</div>
          <div className="muted small">{active?.dueDay ? `her ay ${active.dueDay}. gün` : "sözleşme yok"}</div>
        </div>
        <div className="card">
          <div className="card-label">Bu dönem tahakkuk</div>
          <div className="card-value">{detail.totals.chargedText}</div>
          <div className="muted small">ödenen {detail.totals.paidText}</div>
        </div>
        <div className={`card${detail.totals.openKurus > 0 ? " card-emphasis" : ""}`}>
          <div className="card-label">Açık bakiye</div>
          <div className="card-value">{detail.totals.openText}</div>
        </div>
        <div className="card">
          <div className="card-label">Kiracılık</div>
          <div className="card-value">{detail.contracts.length}</div>
          <div className="muted small">{past.length} geçmiş dönem</div>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>Oturduğu daire</h3>
      {active ? (
        <div className="panel">
          <div className="detail-head">
            <h3>{active.propertyTitle}</h3>
            <span className="badge">{CONTRACT_TR[active.status] ?? active.status}</span>
          </div>
          <p className="muted small">
            {active.address ?? "adres yok"}
            {active.siteName ? ` · ${active.siteName}` : ""}
            {active.buildingName ? ` · ${active.buildingName}` : ""}
            {active.unitNo ? ` · daire ${active.unitNo}` : ""}
            {active.roomCount ? ` · ${active.roomCount}` : ""}
            {active.grossM2 ? ` · ${active.grossM2} m²` : ""}
            {active.floor !== null ? ` · ${active.floor}. kat` : ""}
          </p>
          <p>
            Mal sahibi: <strong>{active.ownerName ?? "—"}</strong>
            {active.ownerPhone ? ` · ${active.ownerPhone}` : ""}
          </p>
          <p className="muted small">
            Kira başlangıcı {new Date(`${active.startDate}T00:00:00`).toLocaleDateString("tr-TR")} ·
            kira günü {active.dueDay ?? "—"} · depozito {active.depositText}
            {active.depositRentCount ? ` (${active.depositRentCount} kira)` : ""} · aidat/fatura:{" "}
            {active.utilityPayer === "tenant"
              ? "kiracı"
              : active.utilityPayer === "owner"
                ? "mal sahibi"
                : "ofis"}
          </p>
        </div>
      ) : (
        <p className="muted">Aktif sözleşme yok; geçmiş dönemler aşağıda.</p>
      )}

      <h3 style={{ marginTop: 18 }}>Ödeme dökümü</h3>
      {detail.charges.length === 0 ? (
        <p className="muted small">Bu kiracı için tahakkuk kaydı yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th>Vade</th>
                <th className="right">Tutar</th>
                <th className="right">Ödenen</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {detail.charges.map((charge) => (
                <tr key={charge.id}>
                  <td>{charge.period.slice(0, 7)}</td>
                  <td>{new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}</td>
                  <td className="right">{charge.amountText}</td>
                  <td className="right">{charge.paidText}</td>
                  <td>
                    {CHARGE_TR[charge.status] ?? charge.status}
                    {charge.overdue && <span className="chip warn"> gecikmiş</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {past.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Geçmiş kiracılıklar</h3>
          <ul className="small muted">
            {past.map((contract) => (
              <li key={contract.id}>
                {contract.propertyTitle} · {contract.startDate} → {contract.endDate ?? "—"} ·{" "}
                {CONTRACT_TR[contract.status] ?? contract.status}
                {contract.endReason ? ` · ${contract.endReason}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {detail.person.notes && <p className="muted small">Not: {detail.person.notes}</p>}
    </div>
  );
}

function Section({ title, count }: { title: string; count: number }) {
  return (
    <div className="shelf-bar">
      <h3>{title}</h3>
      <span className="muted small">{count} kayıt</span>
    </div>
  );
}

function PropertyRail({ rows }: { rows: OwnerProperty[] }) {
  if (rows.length === 0) return <p className="muted small">Bu rafta kayıt yok.</p>;
  return (
    <div className="shelf">
      {rows.map((row) => (
        <div key={`${row.id}-${row.listingId ?? "none"}`} className="shelf-card shelf-card-static">
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
              {row.unitNo ? ` · daire ${row.unitNo}` : ""}
            </div>
            <div className="shelf-price">{row.priceText ?? "fiyat yok"}</div>
            <span className="chip">{row.status ? (STATUS_TR[row.status] ?? row.status) : "ilansız"}</span>
            {row.tenantName && <div className="muted small">Kiracı: {row.tenantName}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

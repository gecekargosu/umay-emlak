import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type OwnerDetail, type OwnerProperty, type OwnerRow } from "../api";
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
const TYPE_TR: Record<string, string> = {
  apartment: "Daire",
  house: "Müstakil ev",
  land: "Arsa",
  shop: "Dükkan",
  office: "Ofis",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr"))
    .join("");
}

function letterOf(name: string): string {
  const ch = (name.trim()[0] ?? "#").toLocaleUpperCase("tr");
  return /[A-ZÇĞİÖŞÜ]/.test(ch) ? ch : "#";
}

/**
 * Mal sahipleri — bilgi bankasındaki mal sahibi klasörü.
 * Alfabetik, yatay kaydırılabilen raf; sahibe tıklayınca mülkleri
 * satılık/kiralık raflarında ve tek tabloda, kiracı ve borç bilgisiyle.
 */
export function Owners() {
  const [rows, setRows] = useState<OwnerRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Yazarken kendiliğinden arar (300 ms) — "Ara" düğmesine basmak gerekmez.
  useEffect(() => {
    const timer = setTimeout(() => {
      void api<{ items: OwnerRow[] }>(
        `/owners${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
      )
        .then((data) => {
          setRows(data.items);
          setError(null);
        })
        .catch(() => setError("Mal sahipleri yüklenemedi"));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function open(id: string) {
    try {
      setDetail(await api<OwnerDetail>(`/owners/${id}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Mal sahibi açılamadı");
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, OwnerRow[]>();
    for (const row of rows ?? []) {
      const letter = letterOf(row.fullName.replace(/^DEMO\s+/i, ""));
      const list = map.get(letter) ?? [];
      list.push(row);
      map.set(letter, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "tr"));
  }, [rows]);

  if (detail) return <OwnerFolder detail={detail} onBack={() => setDetail(null)} />;

  return (
    <div>
      <div className="page-head">
        <h2>Mal sahipleri</h2>
        <span className="spacer" />
        <span className="muted small">{rows === null ? "…" : `${rows.length} sahip`}</span>
      </div>

      <InfoNote title="Her mal sahibinin bir klasörü var.">
        Raf alfabetik ve yatay kaydırılır; bir sahibe tıkladığınızda yalnız onun mülkleri
        açılır — satılıklar ve kiralıklar ayrı raflarda, altında kiracı ve açık borçla birlikte
        tek liste. Bir sahip birden fazla mülkü olabilir; aynı mülk hem satılık hem kiralık
        ilanı taşıyabilir.
      </InfoNote>

      <div className="toolbar">
        <input
          style={{ flex: "1 1 320px" }}
          placeholder="Mal sahibi adı ara… (yazarken süzer)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" className="ghost" onClick={() => setQuery("")}>
            Temizle
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {rows === null && <p className="muted">Yükleniyor…</p>}
      {rows !== null && rows.length === 0 && <p className="muted">Bu aramaya uyan mal sahibi yok.</p>}

      {groups.length > 1 && (
        <div className="letter-nav">
          {groups.map(([letter]) => (
            <a key={letter} href={`#harf-${letter}`}>
              {letter}
            </a>
          ))}
        </div>
      )}

      {groups.map(([letter, items]) => (
        <section key={letter} id={`harf-${letter}`} className="owner-letter">
          <h3>
            {letter} <span className="muted small">({items.length})</span>
          </h3>
          <div className="shelf">
            {items.map((owner) => (
              <button
                key={owner.id}
                type="button"
                className="owner-card"
                onClick={() => void open(owner.id)}
                title={`${owner.fullName} — ${owner.propertyCount} mülk`}
              >
                <span className="owner-avatar">{initials(owner.fullName.replace(/^DEMO\s+/i, ""))}</span>
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
        </section>
      ))}
    </div>
  );
}

function OwnerFolder({ detail, onBack }: { detail: OwnerDetail; onBack: () => void }) {
  const { person, properties } = detail;
  const sales = properties.filter((p) => p.kind === "sale");
  const rents = properties.filter((p) => p.kind === "rent");
  const tenantCount = new Set(properties.map((p) => p.tenantName).filter(Boolean)).size;

  return (
    <div>
      <div className="page-head">
        <BackButton onBack={onBack} label="Mal sahipleri listesi" />
        <h2 style={{ marginLeft: 8 }}>{person.fullName}</h2>
        <span className="spacer" />
        <span className="muted small">{person.propertyCount} mülk</span>
      </div>

      <p className="muted small">
        {person.phone ?? "telefon yok"} · {person.email ?? "e-posta yok"} · sahip olduğu günden
        beri kayıtlı
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

      <Shelf title="Satılıklar" rows={sales} />
      <Shelf title="Kiralıklar" rows={rents} />

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
                <th>İlan</th>
                <th>Durum</th>
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
                  <td>{property.kind ? (KIND_TR[property.kind] ?? property.kind) : "ilansız"}</td>
                  <td>
                    {property.status ? (
                      <span className="chip">{STATUS_TR[property.status] ?? property.status}</span>
                    ) : (
                      "—"
                    )}
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

function Shelf({ title, rows }: { title: string; rows: OwnerProperty[] }) {
  return (
    <section className="shelf-group">
      <div className="shelf-bar">
        <h3>{title}</h3>
        <span className="muted small">{rows.length} kayıt</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Bu rafta kayıt yok.</p>
      ) : (
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
                {row.tenantName && (
                  <div className="muted small">Kiracı: {row.tenantName}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

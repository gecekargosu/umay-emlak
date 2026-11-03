import { useState } from "react";
import type { TeamListing, TeamPortfolio } from "../api";
import { BackButton } from "../components/BackButton";

const ROLE_TR: Record<string, string> = {
  owner: "Ofis sahibi",
  partner: "Ortak",
  manager: "Yönetici",
  agent: "Danışman",
  finance: "Muhasebe",
  viewer: "İzleyici",
};

const OFFER_TR: Record<string, string> = {
  received: "Alındı",
  negotiating: "Pazarlık",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
};

const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

/** Personel portföyü: satılık/kiralık rafları, teklifler ve mülk dosyası. */
export function TeamPortfolioView({
  data,
  onBack,
}: {
  data: TeamPortfolio;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<TeamListing | null>(null);
  const [offerStatus, setOfferStatus] = useState("all");

  if (selected) {
    return <ListingSheet data={data} listing={selected} onBack={() => setSelected(null)} />;
  }

  const sales = data.listings.filter((row) => row.kind === "sale");
  const rents = data.listings.filter((row) => row.kind === "rent");
  const offerCount = data.listings.reduce((sum, row) => sum + row.offers.length, 0);
  const offers = data.listings
    .flatMap((listing) => listing.offers.map((offer) => ({ listing, offer })))
    .filter(({ offer }) => offerStatus === "all" || offer.status === offerStatus);

  return (
    <div>
      <div className="page-head">
        <BackButton onBack={onBack} label="Personel listesi" />
        <h2 style={{ marginLeft: 8 }}>{data.member.fullName}</h2>
        <span className="spacer" />
        <span className="chip">{ROLE_TR[data.member.role] ?? data.member.role}</span>
      </div>
      <p className="muted small">
        {data.member.email}
        {data.member.phone ? ` · ${data.member.phone}` : ""}
        {data.member.canApprove ? " · onay yetkisi var" : " · onay yetkisi yok"}
      </p>

      <div className="cards">
        <div className="card">
          <div className="card-label">Portföy</div>
          <div className="card-value">{data.listings.length}</div>
          <div className="muted small">
            {sales.length} satılık · {rents.length} kiralık
          </div>
        </div>
        <div className="card">
          <div className="card-label">Alınan teklif</div>
          <div className="card-value">{offerCount}</div>
          <div className="muted small">mülk dosyasında görünür</div>
        </div>
        <div className="card">
          <div className="card-label">Aktif ilan</div>
          <div className="card-value">
            {data.listings.filter((row) => row.status === "active").length}
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 12 }}>Satılıklar</h3>
      <ListingRail rows={sales} onOpen={setSelected} />
      <h3 style={{ marginTop: 12 }}>Kiralıklar</h3>
      <ListingRail rows={rents} onOpen={setSelected} />

      <h3>Alınan teklifler</h3>
      <div className="toolbar">
        <span className="muted small">Duruma göre süz:</span>
        <select value={offerStatus} onChange={(event) => setOfferStatus(event.target.value)}>
          <option value="all">Tümü</option>
          {Object.entries(OFFER_TR).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {offers.length === 0 ? (
        <p className="muted small">Bu personelin portföyünde kayıtlı teklif yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mülk</th>
                <th>Teklif veren</th>
                <th>Telefon</th>
                <th className="right">Teklif</th>
                <th>Durum</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {offers.map(({ listing, offer }) => (
                <tr key={offer.id} className="clickable" onClick={() => setSelected(listing)}>
                  <td>{listing.title}</td>
                  <td>{offer.bidderName}</td>
                  <td className="muted">{offer.bidderPhone ?? "—"}</td>
                  <td className="right">{offer.amountText}</td>
                  <td>
                    <span className="chip">{OFFER_TR[offer.status] ?? offer.status}</span>
                  </td>
                  <td className="muted small">
                    {new Date(offer.createdAt).toLocaleDateString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListingRail({
  rows,
  onOpen,
}: {
  rows: TeamListing[];
  onOpen: (listing: TeamListing) => void;
}) {
  if (rows.length === 0) return <p className="muted small">Bu rafta kayıt yok.</p>;
  return (
    <div className="shelf">
      {rows.map((row) => (
        <button key={row.listingId} type="button" className="shelf-card" onClick={() => onOpen(row)}>
          <div className="shelf-cover">
            {row.title
              .replace(/^DEMO\s+/i, "")
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
            <div className="shelf-price">{row.priceText}</div>
            <div className="row-gap" style={{ marginTop: 6 }}>
              <span className="chip">{STATUS_TR[row.status] ?? row.status}</span>
              {row.offers.length > 0 && (
                <span className="chip warn">{row.offers.length} teklif</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ListingSheet({
  data,
  listing,
  onBack,
}: {
  data: TeamPortfolio;
  listing: TeamListing;
  onBack: () => void;
}) {
  const average = data.averages.find((row) => row.district === listing.district);
  const fields: Array<[string, string]> = [
    ["Adres", listing.address ?? "—"],
    ["Site", listing.siteName ?? "—"],
    ["Apartman / blok", [listing.buildingName, listing.block].filter(Boolean).join(" · ") || "—"],
    ["Daire", listing.unitNo ?? "—"],
    [
      "Oda / m² / kat",
      [
        listing.roomCount,
        listing.grossM2 ? `${listing.grossM2} m²` : null,
        listing.floor !== null ? `${listing.floor}. kat` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["Portföye giriş", new Date(listing.enteredAt).toLocaleDateString("tr-TR")],
    [
      "Yayına alınma",
      listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString("tr-TR") : "yayında değil",
    ],
    [
      "Mal sahibi",
      listing.ownerName
        ? `${listing.ownerName}${listing.ownerPhone ? ` · ${listing.ownerPhone}` : ""}`
        : "—",
    ],
  ];

  return (
    <div>
      <div className="page-head">
        <BackButton onBack={onBack} label="Portföye dön" />
        <h2 style={{ marginLeft: 8 }}>{listing.title}</h2>
        <span className="spacer" />
        <span className="chip">{listing.kind === "sale" ? "Satılık" : "Kiralık"}</span>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label">İstenen fiyat</div>
          <div className="card-value">{listing.priceText}</div>
        </div>
        <div className="card">
          <div className="card-label">Bu ilçedeki ortalama</div>
          <div className="card-value">
            {listing.kind === "sale" ? (average?.avgSaleText ?? "—") : (average?.avgRentText ?? "—")}
          </div>
          <div className="muted small">
            {average
              ? `${average.saleCount} satılık · ${average.rentCount} kiralık kayıt`
              : "veri yok"}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Alınan teklif</div>
          <div className="card-value">{listing.offers.length}</div>
        </div>
      </div>

      <div className="panel">
        <table>
          <tbody>
            {fields.map(([label, value]) => (
              <tr key={label}>
                <td className="muted" style={{ width: 220 }}>
                  {label}
                </td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: 18 }}>Teklifler</h3>
        {listing.offers.length === 0 ? (
          <p className="muted small">Bu ilana henüz teklif gelmedi.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Teklif veren</th>
                <th>Telefon</th>
                <th className="right">Tutar</th>
                <th>Durum</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {listing.offers.map((offer) => (
                <tr key={offer.id}>
                  <td>{offer.bidderName}</td>
                  <td className="muted">{offer.bidderPhone ?? "—"}</td>
                  <td className="right">{offer.amountText}</td>
                  <td>
                    <span className="chip warn">{OFFER_TR[offer.status] ?? offer.status}</span>
                  </td>
                  <td className="muted small">
                    {new Date(offer.createdAt).toLocaleDateString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

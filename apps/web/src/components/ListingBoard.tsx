import { useEffect, useState } from "react";
import { api } from "../api";
import { HandoverPanel } from "./HandoverPanel";
import { TenantRequestPanel } from "./TenantRequestPanel";

/**
 * Mülk dosyası panosu — TUR:27.
 * Satılıkta: kime ait, m², kat, oda, adres, giriş tarihi.
 * Kiralıkta ek olarak: kiracı, sözleşme, depozito, kira çizelgesi, ödenmeyen, demirbaş.
 */
type Board = {
  listing: {
    id: string;
    kind: "sale" | "rent";
    status: string;
    priceText: string;
    enteredAt: string;
    publishedAt: string | null;
    authorityNo: string | null;
  };
  property: {
    id: string;
    title: string;
    address: string | null;
    city: string | null;
    district: string | null;
    roomCount: string | null;
    grossM2: number | null;
    floor: number | null;
    block: string | null;
    unitNo: string | null;
    siteName: string | null;
    buildingName: string | null;
    type: string;
    notes: string | null;
  };
  owner: { name: string | null; phone: string | null };
  tenant: { id: string; name: string; phone: string | null; email: string | null } | null;
  contract: {
    id: string;
    startDate: string;
    endDate: string | null;
    rentText: string;
    depositText: string;
    depositRentCount: number | null;
    dueDay: number | null;
    utilityPayer: string | null;
    status: string;
  } | null;
  charges: Array<{
    id: string;
    period: string;
    dueDate: string;
    amountText: string;
    paidText: string;
    remainingText: string;
    status: string;
    overdue: boolean;
  }>;
  openKurus: number;
  openText: string;
  fixtures: Array<{ id: string; name: string; quantity: number; note: string | null }>;
  policies: Array<{
    id: string;
    kind: string;
    insurer: string | null;
    policyNo: string | null;
    endDate: string;
    daysLeft: number;
  }>;
};

const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

const CHARGE_TR: Record<string, string> = {
  open: "Ödenmedi",
  partial: "Kısmi",
  paid: "Ödendi",
  cancelled: "İptal",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("tr-TR");
}

export function ListingBoard({ listingId }: { listingId: string }) {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api<Board>(`/listings/${listingId}/board`)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setError("Mülk dosyası yüklenemedi");
      });
    return () => {
      alive = false;
    };
  }, [listingId]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted small">Mülk bilgileri yükleniyor…</p>;

  const property = data.property;

  return (
    <section>
      <h4>Mülk bilgileri</h4>
      <div className="detail-grid">
        <div>
          <span className="muted small">Mal sahibi</span>
          <strong>{data.owner.name ?? "—"}</strong>
          <div className="muted small">{data.owner.phone ?? "telefon yok"}</div>
        </div>
        <div>
          <span className="muted small">Tür</span>
          <strong>{property.type}</strong>
        </div>
        <div>
          <span className="muted small">Oda</span>
          <strong>{property.roomCount ?? "—"}</strong>
        </div>
        <div>
          <span className="muted small">Brüt m²</span>
          <strong>{property.grossM2 ? `${property.grossM2} m²` : "—"}</strong>
        </div>
        <div>
          <span className="muted small">Kat</span>
          <strong>{property.floor ?? "—"}</strong>
        </div>
        <div>
          <span className="muted small">Blok / Daire</span>
          <strong>
            {property.block ?? "—"} / {property.unitNo ?? "—"}
          </strong>
        </div>
        <div>
          <span className="muted small">Site / Apartman</span>
          <strong>{[property.siteName, property.buildingName].filter(Boolean).join(" · ") || "—"}</strong>
        </div>
        <div>
          <span className="muted small">İlan fiyatı</span>
          <strong>{data.listing.priceText}</strong>
        </div>
        <div>
          <span className="muted small">Portföye giriş</span>
          <strong>{formatDate(data.listing.enteredAt)}</strong>
        </div>
        <div>
          <span className="muted small">Yayına alınma</span>
          <strong>{formatDate(data.listing.publishedAt)}</strong>
        </div>
        <div>
          <span className="muted small">Durum</span>
          <strong>{STATUS_TR[data.listing.status] ?? data.listing.status}</strong>
        </div>
        <div>
          <span className="muted small">İlan yetki no</span>
          <strong>{data.listing.authorityNo ?? "—"}</strong>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 8 }}>
        Adres: {property.address ?? "—"} · {[property.district, property.city].filter(Boolean).join(", ") || "konum yok"}
      </p>
      {property.notes && <p className="muted small">Not: {property.notes}</p>}

      <h4>Poliçeler (DASK / sigorta)</h4>
      {data.policies.length === 0 ? (
        <p className="muted small">
          Bu mülk için poliçe kaydı yok. Operasyon → Poliçeler / DASK ekranından eklenir.
        </p>
      ) : (
        <ul className="doc-list">
          {data.policies.map((policy) => (
            <li key={policy.id}>
              <strong>{policy.kind.toUpperCase()}</strong> · bitiş{" "}
              {formatDate(policy.endDate)}
              {policy.insurer ? ` · ${policy.insurer}` : ""}
              {policy.daysLeft < 0 ? (
                <span className="badge"> {Math.abs(policy.daysLeft)} gün geçti</span>
              ) : policy.daysLeft <= 30 ? (
                <span className="badge"> {policy.daysLeft} gün kaldı</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {data.listing.kind === "rent" && (
        <>
          <h4>Kiracı ve sözleşme</h4>
          {!data.tenant ? (
            <p className="muted small">Bu kiralık için aktif kiracı/sözleşme yok.</p>
          ) : (
            <>
              <div className="detail-grid">
                <div>
                  <span className="muted small">Kiracı</span>
                  <strong>{data.tenant.name}</strong>
                  <div className="muted small">{data.tenant.phone ?? "telefon yok"}</div>
                </div>
                <div>
                  <span className="muted small">Aylık kira</span>
                  <strong>{data.contract?.rentText ?? "—"}</strong>
                </div>
                <div>
                  <span className="muted small">Depozito</span>
                  <strong>{data.contract?.depositText ?? "—"}</strong>
                  {data.contract?.depositRentCount ? (
                    <div className="muted small">{data.contract.depositRentCount} kira karşılığı</div>
                  ) : null}
                </div>
                <div>
                  <span className="muted small">Kira günü</span>
                  <strong>{data.contract?.dueDay ?? "—"}</strong>
                </div>
                <div>
                  <span className="muted small">Başlangıç</span>
                  <strong>{formatDate(data.contract?.startDate ?? null)}</strong>
                </div>
                <div>
                  <span className="muted small">Bitiş</span>
                  <strong>{formatDate(data.contract?.endDate ?? null)}</strong>
                </div>
                <div>
                  <span className="muted small">Aidat/fatura</span>
                  <strong>
                    {data.contract?.utilityPayer === "owner"
                      ? "Mal sahibi"
                      : data.contract?.utilityPayer === "office"
                        ? "Ofis"
                        : "Kiracı"}
                  </strong>
                </div>
                <div>
                  <span className="muted small">Açık borç</span>
                  <strong style={{ color: data.openKurus > 0 ? "var(--danger)" : undefined }}>
                    {data.openText}
                  </strong>
                </div>
              </div>

              <h4>Kira çizelgesi</h4>
              {data.charges.length === 0 ? (
                <p className="muted small">Henüz tahakkuk yok.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Dönem</th>
                        <th>Vade</th>
                        <th className="right">Kira</th>
                        <th className="right">Ödenen</th>
                        <th className="right">Kalan</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.charges.map((row) => (
                        <tr key={row.id} className={row.overdue ? "row-danger" : undefined}>
                          <td>{row.period.slice(0, 7)}</td>
                          <td>{formatDate(row.dueDate)}</td>
                          <td className="right">{row.amountText}</td>
                          <td className="right">{row.paidText}</td>
                          <td className="right">{row.remainingText}</td>
                          <td>
                            {row.overdue ? "Gecikmiş" : CHARGE_TR[row.status] ?? row.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <h4>Demirbaşlar</h4>
          {data.fixtures.length === 0 ? (
            <p className="muted small">Demirbaş kaydı yok.</p>
          ) : (
            <ul className="doc-list">
              {data.fixtures.map((fixture) => (
                <li key={fixture.id}>
                  <strong>{fixture.name}</strong> · {fixture.quantity} adet
                  {fixture.note ? <span className="muted small"> · {fixture.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            Demirbaş fotoğrafları belge arşivinden yüklenebilir; tutanak aşağıda.
          </p>

          {data.contract && (
            <HandoverPanel
              contractId={data.contract.id}
              depositText={data.contract.depositText}
            />
          )}

          {data.contract && <TenantRequestPanel contractId={data.contract.id} />}
        </>
      )}
    </section>
  );
}

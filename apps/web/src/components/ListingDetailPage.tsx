import { BackButton } from "./BackButton";
import { PropertyMedia } from "./PropertyMedia";
import { ListingBoard } from "./ListingBoard";
import { MaintenancePanel } from "./MaintenancePanel";
import { ListingOffers } from "./ListingOffers";
import { ListingMoney } from "./ListingMoney";
import { KIND_TR, NEXT_STATUS, STATUS_TR } from "./listing-labels";
import { kurusToText, type KindOption, type ListingDetail, type PropertyAssets } from "../api";

/**
 * Mülk dosyası (ilan detayı) — TUR:50.
 * Listings.tsx 700 satırı geçtiği için ayrıldı; davranış aynı (TUR:27 tam sayfa kuralı).
 * State sayfada kalır, bu bileşen yalnız gösterir ve olayları yukarı iletir.
 */
export function ListingDetailPage({
  detail,
  canApprove,
  kinds,
  file,
  setFile,
  docKind,
  setDocKind,
  busy,
  priceText,
  setPriceText,
  note,
  setNote,
  authority,
  setAuthority,
  assets,
  subForm,
  setSubForm,
  fixtureForm,
  setFixtureForm,
  onRefresh,
  onUploadDoc,
  onSavePrice,
  onChangeStatus,
  onSaveAuthority,
  onAddSubscription,
  onAddFixture,
  onRemoveAsset,
  onClose,
}: {
  detail: ListingDetail;
  canApprove: boolean;
  kinds: KindOption[];
  file: File | null;
  setFile: (value: File | null) => void;
  docKind: string;
  setDocKind: (value: string) => void;
  busy: boolean;
  priceText: string;
  setPriceText: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  authority: string;
  setAuthority: (value: string) => void;
  assets: PropertyAssets | null;
  subForm: { kind: string; provider: string; monthlyText: string };
  setSubForm: (value: { kind: string; provider: string; monthlyText: string }) => void;
  fixtureForm: { name: string; quantity: number };
  setFixtureForm: (value: { name: string; quantity: number }) => void;
  onRefresh: () => void;
  onUploadDoc: () => void;
  onSavePrice: () => void;
  onChangeStatus: (status: string, forced?: boolean) => void;
  onSaveAuthority: () => void;
  onAddSubscription: () => void;
  onAddFixture: () => void;
  onRemoveAsset: (path: string) => void;
  onClose: () => void;
}) {
  return (
        <div className="listing-page">
          <BackButton onBack={() => onClose()} label="Portföy listesine dön" />
          <div className="page-head">
            <h2>{detail.property.title}</h2>
            <span className="spacer" />
            <span className="badge">
              {KIND_TR[detail.listing.kind]} · {detail.listing.price}
            </span>
          </div>
          <div className="detail-head">
            <span className="badge">{STATUS_TR[detail.listing.status] ?? detail.listing.status}</span>
          </div>

          <PropertyMedia propertyId={detail.property.id} />

          <ListingBoard listingId={detail.listing.id} />
          <MaintenancePanel propertyId={detail.property.id} />
          <p className="muted small">
            {[detail.property.district, detail.property.city].filter(Boolean).join(", ") || "konum yok"}
            {detail.property.siteName ? ` · ${detail.property.siteName}` : ""}
            {detail.property.buildingName ? ` · ${detail.property.buildingName}` : ""}
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

          <ListingOffers listingId={detail.listing.id} />

          <ListingMoney
            listingId={detail.listing.id}
            canApprove={canApprove}
            onChanged={() => void onRefresh()}
          />

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
            <button type="button" disabled={!file || busy} onClick={() => void onUploadDoc()}>
              Belge ekle
            </button>
          </div>

          <h4>Fiyat</h4>
          <div className="inline-form">
            <input value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void onSavePrice()}>
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
                onClick={() => void onChangeStatus(next.status)}
              >
                {next.label}
              </button>
            ))}
            {detail.listing.status === "draft" && !detail.canPublish && canApprove && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void onChangeStatus("active", true)}
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
            <button type="button" disabled={busy} onClick={() => void onSaveAuthority()}>
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
                        void onRemoveAsset(
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
                        void onRemoveAsset(`/properties/${detail.listing.propertyId}/fixtures/${fixture.id}`)
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
                <button type="button" disabled={busy} onClick={() => void onAddSubscription()}>
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
                <button type="button" disabled={busy} onClick={() => void onAddFixture()}>
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
            <button type="button" className="ghost" onClick={() => onClose()}>
              Kapat
            </button>
          </div>
        </div>
  );
}

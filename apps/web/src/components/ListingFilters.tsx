/**
 * Portföy filtresi — Listings.tsx 900 satırı geçtiği için ayrıldı (K-1/K-2, TUR:49).
 * Davranış aynı: yazarken süzülür, "Hemen filtrele" ve "Temizle" çalışır.
 */

/** TUR:20 — alan bazlı portföy filtresi. Hepsi birlikte daraltır. */
export type Filters = {
  address: string;
  unitNo: string;
  site: string;
  building: string;
  owner: string;
  tenant: string;
  district: string;
  rooms: string;
  minTl: string;
  maxTl: string;
  kind: string;
  status: string;
};

export const EMPTY_FILTERS: Filters = {
  address: "",
  unitNo: "",
  site: "",
  building: "",
  owner: "",
  tenant: "",
  district: "",
  rooms: "",
  minTl: "",
  maxTl: "",
  kind: "",
  status: "",
};

export function ListingFilters({
  filters,
  setFilters,
  districts,
  onSubmit,
  onClear,
}: {
  filters: Filters;
  setFilters: (next: Filters) => void;
  districts: string[];
  onSubmit: () => void;
  onClear: () => void;
}) {
  return (
      <form
        className="filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="filter-grid">
          <label>
            Adres
            <input
              placeholder="sokak, cadde, mahalle"
              value={filters.address}
              onChange={(e) => setFilters({ ...filters, address: e.target.value })}
            />
          </label>
          <label>
            Daire no
            <input
              placeholder="örn. 12"
              value={filters.unitNo}
              onChange={(e) => setFilters({ ...filters, unitNo: e.target.value })}
            />
          </label>
          <label>
            Site
            <input
              placeholder="site adı"
              value={filters.site}
              onChange={(e) => setFilters({ ...filters, site: e.target.value })}
            />
          </label>
          <label>
            Apartman
            <input
              placeholder="apartman / blok adı"
              value={filters.building}
              onChange={(e) => setFilters({ ...filters, building: e.target.value })}
            />
          </label>
          <label>
            Mal sahibi
            <input
              placeholder="ad soyad"
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
            />
          </label>
          <label>
            Kiracı
            <input
              placeholder="ad soyad"
              value={filters.tenant}
              onChange={(e) => setFilters({ ...filters, tenant: e.target.value })}
            />
          </label>
          <label>
            İlçe
            <select
              value={filters.district}
              onChange={(e) => setFilters({ ...filters, district: e.target.value })}
            >
              <option value="">Tüm ilçeler</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>
          <label>
            Oda sayısı
            <select
              value={filters.rooms}
              onChange={(e) => setFilters({ ...filters, rooms: e.target.value })}
            >
              <option value="">Tümü</option>
              {["1+1", "2+1", "3+1", "4+1"].map((room) => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
            </select>
          </label>
          <label>
            En az fiyat (₺)
            <input
              inputMode="numeric"
              placeholder="örn. 500000"
              value={filters.minTl}
              onChange={(e) => setFilters({ ...filters, minTl: e.target.value })}
            />
          </label>
          <label>
            En çok fiyat (₺)
            <input
              inputMode="numeric"
              placeholder="örn. 5000000"
              value={filters.maxTl}
              onChange={(e) => setFilters({ ...filters, maxTl: e.target.value })}
            />
          </label>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
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
          <button type="submit">Hemen filtrele</button>
          <span className="muted small">Yazarken kendiliğinden süzülür.</span>
          <button
            type="button"
            className="ghost"
            onClick={() => onClear()}
          >
            Temizle
          </button>
        </div>
      </form>
  );
}

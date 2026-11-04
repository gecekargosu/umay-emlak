import type { ListingRow } from "../api";
import { STATUS_TR } from "./listing-labels";

/** Raf görünümü: satılıklar / kiralıklar. Kart tıklanınca mülk dosyası açılır (TUR:49 ayrıldı). */
const CHIP: Record<string, string> = {
  draft: "warn",
  active: "ok",
  reserved: "info",
  closed: "",
  archived: "",
};

/** Raf görünümü: kiralıklar / satılıklar. Kart tıklanınca ilan detayı açılır. */
export function Shelf({
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
  const total = rows.length;
  const shown = rows.slice(0, 10);

  return (
    <section>
      <div className="shelf-bar">
        <h3>{title}</h3>
        <span className="muted small">{total} kayıt</span>
      </div>
      {total === 0 ? (
        <p className="muted small">Bu rafta kayıt yok.</p>
      ) : (
        <div className="shelf">
          {shown.map((row) => (
              <button
                key={row.id}
                type="button"
                className="shelf-card"
                style={selectedId === row.id ? { borderColor: "var(--accent)" } : undefined}
                onClick={() => onOpen(row.id)}
              >
                <div className="shelf-cover">
                  {(row as { coverUrl?: string | null }).coverUrl ? (
                    <img
                      src={(row as { coverUrl?: string | null }).coverUrl!}
                      alt={row.title}
                      loading="lazy"
                    />
                  ) : (
                    row.title
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toLocaleUpperCase("tr"))
                      .join("")
                  )}
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
      {total > shown.length && (
        <p className="muted small">
          Rafta ilk {shown.length} kayıt gösteriliyor; {total - shown.length} kayıt daha var —
          tümü aşağıdaki listede.
        </p>
      )}
    </section>
  );
}


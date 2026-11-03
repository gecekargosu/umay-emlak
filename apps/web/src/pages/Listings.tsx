import { useEffect, useState } from "react";
import { api, type ListingRow } from "../api";

const KIND_TR: Record<string, string> = { sale: "Satılık", rent: "Kiralık" };
const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

export function Listings() {
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: ListingRow[] }>("/listings")
      .then((data) => setRows(data.items))
      .catch(() => setError("Portföy yüklenemedi"));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!rows) return <p className="muted">Yükleniyor…</p>;

  return (
    <div>
      <h2>Portföy</h2>
      {rows.length === 0 ? (
        <p className="muted">
          Henüz portföy yok. Kişiler ekranından mal sahibi ekleyip içe aktarma yapabilirsiniz.
        </p>
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
              <tr key={row.id}>
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
    </div>
  );
}

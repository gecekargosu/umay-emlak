import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Görevler — H-7 (M2): ana sayfadaki "Görevler" kutusu tıklanmıyordu.
 *
 * Veri zaten var: /maintenance ucu arıza/bakım taleplerini listeliyor.
 * Bu ekran yalnız okur; durum değişikliği ve yeni talep mülk dosyasından yapılır
 * (kural: düzenleme mülk dosyasında).
 */

type Filter = "open" | "in_progress" | "done" | "all";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Açık" },
  { key: "in_progress", label: "İşlemde" },
  { key: "done", label: "Bitti" },
  { key: "all", label: "Tümü" },
];

type TaskRow = {
  id: string;
  propertyTitle: string;
  district: string | null;
  title: string;
  categoryLabel: string;
  priorityLabel: string;
  priority: string;
  statusLabel: string;
  reportedAt: string;
  daysOpen: number;
  costText: string | null;
  reporterName: string | null;
  photoCount: number;
};

export function Tasks({ onGo }: { onGo?: (page: string) => void }) {
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    const query = filter === "all" ? "" : `?status=${filter}`;
    void api<{ items: TaskRow[] }>(`/maintenance${query}`)
      .then((data) => {
        setRows(data.items);
        setError(null);
      })
      .catch(() => {
        setError("Görevler yüklenemedi");
        setRows([]);
      });
  }, [filter]);

  return (
    <div>
      <div className="page-head">
        <h2>Görevler</h2>
        <span className="muted small">
          {rows === null ? "yükleniyor…" : `${rows.length} kayıt`}
        </span>
      </div>

      <p className="info-note">
        Arıza ve bakım talepleri burada toplanır. Yeni talep, durum değişikliği, masraf ve
        fotoğraf <strong>mülk dosyasındaki Arıza / bakım</strong> bölümünden yapılır; bu
        ekran yalnız takip içindir.
      </p>

      <div className="toolbar">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip${filter === item.key ? " active" : ""}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
        {onGo && (
          <button type="button" className="ghost" onClick={() => onGo("portfoy")}>
            Portföy'e git
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {rows === null && <p className="muted">Yükleniyor…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="muted">Bu filtrede kayıt yok.</p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mülk</th>
                <th>Talep</th>
                <th>Tür / öncelik</th>
                <th>Bildiren</th>
                <th>Açılış</th>
                <th className="right">Gün</th>
                <th className="right">Masraf</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.priority === "urgent" ? "row-danger" : ""}>
                  <td>
                    <strong>{row.propertyTitle}</strong>
                    {row.district && <div className="muted small">{row.district}</div>}
                  </td>
                  <td>
                    {row.title}
                    {row.photoCount > 0 && (
                      <div className="muted small">{row.photoCount} fotoğraf</div>
                    )}
                  </td>
                  <td>
                    {row.categoryLabel}
                    <div className="muted small">{row.priorityLabel}</div>
                  </td>
                  <td>{row.reporterName ?? "—"}</td>
                  <td>{new Date(`${row.reportedAt}T00:00:00`).toLocaleDateString("tr-TR")}</td>
                  <td className="right">{row.daysOpen}</td>
                  <td className="right">{row.costText ?? "—"}</td>
                  <td>{row.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

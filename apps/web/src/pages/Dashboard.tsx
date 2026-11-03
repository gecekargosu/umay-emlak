import { useEffect, useState } from "react";
import { api, type Summary } from "../api";

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Summary>("/summary")
      .then(setSummary)
      .catch(() => setError("Pano yüklenemedi"));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!summary) return <p className="muted">Yükleniyor…</p>;

  return (
    <div>
      <h2>Pano</h2>

      {summary.overdueCount > 0 && (
        <div className="alert">
          {summary.overdueCount} kira vadesi geçmiş. Bugün ilgilenilmesi gereken iş burada.
        </div>
      )}

      <div className="cards">
        <Card label="Tahsil edilecek" value={summary.openFormatted} emphasis />
        <Card label="Vadesi geçen" value={String(summary.overdueCount)} />
        <Card label="Aktif portföy" value={String(summary.activeListings)} />
        <Card label="Aktif sözleşme" value={String(summary.activeContracts)} />
        <Card label="Gayrimenkul" value={String(summary.properties)} />
      </div>

      <p className="muted small">
        Not: tutarlar kuruş hassasiyetinde saklanır, ekranda Türk Lirası olarak gösterilir.
      </p>
    </div>
  );
}

function Card({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`card${emphasis ? " card-emphasis" : ""}`}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}

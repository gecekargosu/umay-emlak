import { useEffect, useState } from "react";
import { api, type Summary, type Today } from "../api";
import { InfoNote } from "../components/InfoNote";

/**
 * Pano — "bugün ne yapılmalı".
 * Sayı değil İŞ gösterir: gecikmiş kira, bu hafta vadesi gelen, belgesi eksik
 * portföy, onay bekleyen eşleştirme, taslak aktarım, bitecek sözleşme.
 * Her başlık ilgili ekrana götürür; eylem orada yapılır.
 */
export function Dashboard({ onGo }: { onGo?: (page: string) => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Summary>("/summary")
      .then(setSummary)
      .catch(() => setError("Pano yüklenemedi"));
    void api<Today>("/today")
      .then(setToday)
      .catch(() => setError("Bugünün işleri yüklenemedi"));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!summary || !today) return <p className="muted">Yükleniyor…</p>;

  const totalActions =
    today.counts.overdue +
    today.counts.dueSoon +
    today.counts.missingDocs +
    today.counts.pendingMatches +
    today.counts.draftPayouts +
    today.counts.expiringContracts;

  return (
    <div>
      <div className="page-head">
        <h2>Bugün</h2>
      </div>
      <InfoNote title="Bu ekran ofisin bugünkü iş listesidir.">
        Sıralama: <strong>gecikmiş → bu hafta → eksik belge → bekleyen onay → taslak aktarım →
        bitecek sözleşme</strong>. Her başlık ilgili ekrana götürür; işlem orada yapılır. Kırmızı
        gecikmiş, sarı yaklaşan, mavi "dikkat" demektir.
      </InfoNote>
      <p className="muted small">
        {new Date(`${today.date}T00:00:00`).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        · {today.month.periodLabel}: tahakkuk {today.month.charged}, tahsil {today.month.collected}
      </p>

      {totalActions === 0 ? (
        <div className="alert">
          Bugün acil iş yok. Gecikmiş kira, eksik belge ve bekleyen onay bulunmuyor.
        </div>
      ) : (
        <p className="muted">
          Bugün ilgilenilmesi gereken <strong>{totalActions}</strong> kayıt var.
        </p>
      )}

      <div className="cards">
        <Card label="Tahsil edilecek" value={summary.openFormatted} emphasis />
        <Card label="Vadesi geçen" value={String(summary.overdueCount)} />
        <Card label="Aktif portföy" value={String(summary.activeListings)} />
        <Card label="Aktif sözleşme" value={String(summary.activeContracts)} />
        <Card label="Belge" value={String(summary.documents)} />
      </div>

      {today.charges.overdue.length > 0 && (
        <Section
          title="Gecikmiş kiralar"
          hint="Vadesi geçen ve hâlâ kapanmayan tahakkuklar. İhtarname adayları işaretli."
          action={onGo ? { label: "Kiralar'a git", onClick: () => onGo("kiralar") } : undefined}
        >
          <ul className="action-list">
            {today.charges.overdue.slice(0, 8).map((ch) => (
              <li key={ch.id}>
                <div>
                  <strong>{ch.tenantName}</strong> · {ch.propertyTitle}
                  {ch.level === "formal" && <span className="badge">ihtarname adayı</span>}
                  {ch.level === "reminder" && ch.noticeSentAt === null && (
                    <span className="badge">hatırlatma</span>
                  )}
                </div>
                <div className="muted small">
                  {ch.daysOverdue} gün gecikme · kalan {ch.remaining} · vade{" "}
                  {new Date(`${ch.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {today.charges.dueSoon.length > 0 && (
        <Section title="Bu hafta vadesi gelenler">
          <ul className="action-list">
            {today.charges.dueSoon.slice(0, 8).map((ch) => (
              <li key={ch.id}>
                <div>
                  <strong>{ch.tenantName}</strong> · {ch.propertyTitle}
                </div>
                <div className="muted small">
                  {ch.daysLeft === 0 ? "bugün" : `${ch.daysLeft} gün sonra`} · {ch.remaining}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {today.missingDocs.length > 0 && (
        <Section
          title="Belgesi eksik portföy"
          hint="Yayına alma belge şartına takılır; eksikler tamamlanınca ilan yayına girer."
          action={onGo ? { label: "Portföy'e git", onClick: () => onGo("portfoy") } : undefined}
        >
          <ul className="action-list">
            {today.missingDocs.map((row) => (
              <li key={row.listingId}>
                <div>
                  <strong>{row.title}</strong>{" "}
                  <span className="muted small">
                    ({row.status === "draft" ? "taslak" : "aktif"})
                  </span>
                </div>
                <div className="muted small">eksik: {row.missing.join(", ")}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {today.pendingMatches.length > 0 && (
        <Section
          title="Onay bekleyen belge eşleştirmesi"
          hint="Sistem öneri üretti; bağı kurmak için yetkili onayı gerekiyor."
          action={onGo ? { label: "Belgeler'e git", onClick: () => onGo("belgeler") } : undefined}
        >
          <ul className="action-list">
            {today.pendingMatches.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.documentTitle}</strong>{" "}
                  <span className="muted small">güven {row.score}/100</span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {today.payouts.length > 0 && (
        <Section
          title="Taslak mal sahibi aktarımı"
          hint="Aktarım oluşturulmuş ama ödendi işaretlenmemiş."
          action={onGo ? { label: "Sahipler'e git", onClick: () => onGo("sahipler") } : undefined}
        >
          <ul className="action-list">
            {today.payouts.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.propertyTitle}</strong> · {row.periodLabel}
                </div>
                <div className="muted small">net {row.net}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {today.contracts.length > 0 && (
        <Section
          title="Bitecek sözleşmeler"
          hint="30 gün içinde bitenler: yenileme veya çıkış konuşulmalı."
          action={onGo ? { label: "Sözleşmeler'e git", onClick: () => onGo("sozlesmeler") } : undefined}
        >
          <ul className="action-list">
            {today.contracts.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.propertyTitle}</strong>
                </div>
                <div className="muted small">
                  {row.endDate} · {row.daysLeft} gün kaldı
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="muted small">
        Not: tutarlar kuruş hassasiyetinde saklanır; panoda yalnız gösterilir.
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

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="detail-head">
        <h3>{title}</h3>
        {action && (
          <button type="button" className="ghost" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

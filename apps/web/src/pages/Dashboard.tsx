import { useEffect, useState } from "react";
import { api, type Summary, type Today } from "../api";
import { Calendar } from "./Calendar";

/**
 * Ana sayfa — kaynak dosya "8. Ana sayfa nasıl olmalı?" (satır 357-410).
 *
 * Tarif: üstte büyük AKSİYON MERKEZİ, altında modül kutuları
 * (Mal sahipleri, Gayrimenkuller, Kiracılar, Personeller, Kira takibi,
 * Sözleşmeler, DASK, Görevler, Finans, Mesajlar).
 * Kural: Aysan ekrana baktığında ilk 10 saniyede ofiste ne olduğunu anlamalı.
 * Modülü olmayan kutu "planlı" der; sıfır uydurulmaz (Y-12/Y-23/Y-19).
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

  const c = today.counts;
  const modules = today.modules;
  const districts = [
    ...new Set(today.charges.overdue.map((ch) => ch.district).filter(Boolean) as string[]),
  ].slice(0, 3);
  const dueSoonDistricts = [
    ...new Set(today.charges.dueSoon.map((ch) => ch.district).filter(Boolean) as string[]),
  ].slice(0, 3);

  const allActions: Array<{
    key: string;
    count: number;
    label: string;
    sub: string;
    tone: "danger" | "warn" | "info";
    page: string;
  }> = [
    {
      key: "overdue",
      count: c.overdue,
      label: "gecikmiş kira",
      sub: districts.length > 0 ? districts.join(", ") : "kontrol edilmeli",
      tone: "danger",
      page: "kiralar",
    },
    {
      key: "dueSoon",
      count: c.dueSoon,
      label: "kira günü yaklaşıyor",
      sub: dueSoonDistricts.length > 0 ? `${dueSoonDistricts.join(", ")} · önümüzdeki 7 gün` : "önümüzdeki 7 gün",
      tone: "warn",
      page: "kiralar",
    },
    {
      key: "expiring",
      count: c.expiringContracts,
      label: "sözleşme yenilenecek",
      sub: "önümüzdeki 30 gün",
      tone: "warn",
      page: "sozlesmeler",
    },
    {
      key: "missingDocs",
      count: c.missingDocs,
      label: "portföyün belgesi eksik",
      sub: "tapu / yetki / kimlik tamamlanmadan yayına girmez",
      tone: "info",
      page: "portfoy",
    },
    {
      key: "pendingMatches",
      count: c.pendingMatches,
      label: "belge eşleştirmesi onay bekliyor",
      sub: "sistem önerdi, yetkili onayı gerekli",
      tone: "info",
      page: "belgeler",
    },
    {
      key: "draftPayouts",
      count: c.draftPayouts,
      label: "taslak mal sahibi aktarımı",
      sub: "oluşturulmuş ama ödendi işaretlenmemiş",
      tone: "info",
      page: "sahipler",
    },
    {
      key: "policies",
      count: c.policyWarnings,
      label: "poliçe bitiyor / bitti",
      sub: "30 gün içinde bitecek veya süresi geçmiş poliçeler",
      tone: "warn",
      page: "policeler",
    },
  ];

  const actions = allActions.filter((row) => row.count > 0);

  const totalActions = actions.reduce((sum, row) => sum + row.count, 0);
  const go = (page: string) => onGo?.(page);

  const tiles: Array<{
    key: string;
    label: string;
    value: string;
    sub: string;
    page: string | null;
    tone?: "danger" | "warn";
  }> = [
    {
      key: "owners",
      label: "Mal sahipleri",
      value: String(modules.owners.total),
      sub: `${modules.owners.portfolio} portföy kaydı`,
      page: "kisiler",
    },
    {
      key: "properties",
      label: "Gayrimenkuller",
      value: String(modules.properties.total),
      sub: `${modules.properties.empty} boş · ${modules.properties.occupied} dolu · ${modules.properties.sale} satılık · ${modules.properties.rent} kiralık`,
      page: "portfoy",
    },
    {
      key: "tenants",
      label: "Kiracılar",
      value: String(modules.tenants.active),
      sub: `${modules.tenants.leaving} sözleşme 30 günde bitiyor`,
      page: "kisiler",
      tone: modules.tenants.leaving > 0 ? "warn" : undefined,
    },
    {
      key: "staff",
      label: "Personeller",
      value: String(modules.staff.total),
      sub: `${modules.staff.approvers} onay yetkili`,
      page: "ekip",
    },
    {
      key: "rent",
      label: "Kira takibi",
      value: String(modules.rent.overdue),
      sub: `geciken · ${modules.rent.overdueFormatted} · beklenen ${modules.rent.charged} / ödenen ${modules.rent.collected}`,
      page: "kiralar",
      tone: modules.rent.overdue > 0 ? "danger" : undefined,
    },
    {
      key: "contracts",
      label: "Sözleşmeler",
      value: String(modules.contracts.active),
      sub: `${modules.contracts.expiring} tanesi 30 günde yenilenecek`,
      page: "sozlesmeler",
      tone: modules.contracts.expiring > 0 ? "warn" : undefined,
    },
    {
      key: "dask",
      label: "DASK / poliçe",
      value: String(modules.dask.warning),
      sub:
        modules.dask.total === 0
          ? "poliçe kaydı yok — Poliçeler ekranından ekle"
          : `${modules.dask.total} poliçe kayıtlı · ${modules.dask.warning} tanesi 30 günde bitiyor`,
      page: "policeler",
      tone: modules.dask.warning > 0 ? "warn" : undefined,
    },
    {
      key: "tasks",
      label: "Görevler",
      value: String(modules.tasks.open),
      sub:
        modules.tasks.open === 0
          ? "açık arıza talebi yok — mülk dosyasından açılır"
          : `${modules.tasks.open} açık arıza talebi${modules.tasks.urgent > 0 ? ` · ${modules.tasks.urgent} acil` : ""}`,
      tone: modules.tasks.urgent > 0 ? "warn" : undefined,
      page: null,
    },
    {
      key: "finance",
      label: "Finans",
      value: modules.finance.payoutDraft,
      sub: `taslak aktarım · ödenen ${modules.finance.payoutPaid} · komisyon ${modules.finance.commission}`,
      page: "sahipler",
    },
    {
      key: "messages",
      label: "Mesajlar",
      value: "—",
      sub: "modül planlı (Y-19): e-posta/SMS gönderimi henüz yok",
      page: null,
    },
  ];

  return (
    <div>
      {/* TUR:26 — kullanıcı isteği: "bugün yazan başlığı ve bilgi penceresini kaldır,
          yerine takvim ekle". Ana sayfa artık takvimle açılır. */}
      <Calendar compact onGo={onGo} />

      <h3>Modüller</h3>
      <div className="module-grid">
        {tiles.map((tile) => {
          const Tag = tile.page ? "button" : "div";
          return (
            <Tag
              key={tile.key}
              {...(tile.page
                ? { type: "button" as const, onClick: () => go(tile.page as string) }
                : {})}
              className={`module-tile${tile.page ? "" : " not-built"}${tile.tone ? ` ${tile.tone}` : ""}`}
            >
              <div className="module-title">{tile.label}</div>
              <div className="module-value">{tile.value}</div>
              <div className="module-sub">{tile.sub}</div>
            </Tag>
          );
        })}
      </div>

      {/* TUR:24 — kullanıcı isteği: "modüller başlamalı, aksiyon merkezini en alta al" */}
      <section className="action-center">
        <div className="ac-head">
          <h3>Aksiyon merkezi</h3>
          <span className="ac-count">{totalActions} işlem</span>
        </div>
        {totalActions === 0 ? (
          <p className="muted small">
            Bugün acil iş yok. Gecikmiş kira, eksik belge, bekleyen onay ve bitecek sözleşme
            bulunmuyor.
          </p>
        ) : (
          <div className="ac-grid">
            {actions.map((row) => (
              <button
                key={row.key}
                type="button"
                className={`ac-row ${row.tone}`}
                onClick={() => go(row.page)}
              >
                <span className="ac-num">{row.count}</span>
                <span className="ac-text">
                  <strong>{row.label}</strong>
                  <span className="muted small">{row.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          {today.month.periodLabel}: tahakkuk {today.month.charged} · tahsil {today.month.collected}
        </p>
      </section>

      {today.charges.overdue.length > 0 && (
        <Section
          title="Gecikmiş kiralar"
          hint="Vadesi geçen ve hâlâ kapanmayan tahakkuklar. İhtarname adayları işaretli."
          action={{ label: "Kiralar'a git", onClick: () => go("kiralar") }}
        >
          <ul className="action-list">
            {today.charges.overdue.slice(0, 8).map((ch) => (
              <li key={ch.id}>
                <div>
                  <strong>{ch.tenantName}</strong> · {ch.propertyTitle}
                  {ch.district && <span className="muted small"> ({ch.district})</span>}
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
        <Section
          title="Bu hafta vadesi gelenler"
          action={{ label: "Kiralar'a git", onClick: () => go("kiralar") }}
        >
          <ul className="action-list">
            {today.charges.dueSoon.slice(0, 8).map((ch) => (
              <li key={ch.id}>
                <div>
                  <strong>{ch.tenantName}</strong> · {ch.propertyTitle}
                  {ch.district && <span className="muted small"> ({ch.district})</span>}
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
          action={{ label: "Portföy'e git", onClick: () => go("portfoy") }}
        >
          <ul className="action-list">
            {today.missingDocs.map((row) => (
              <li key={row.listingId}>
                <div>
                  <strong>{row.title}</strong>{" "}
                  <span className="muted small">({row.status === "draft" ? "taslak" : "aktif"})</span>
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
          action={{ label: "Belgeler'e git", onClick: () => go("belgeler") }}
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
          action={{ label: "Sahipler'e git", onClick: () => go("sahipler") }}
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
          action={{ label: "Sözleşmeler'e git", onClick: () => go("sozlesmeler") }}
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

      {today.policies.length > 0 && (
        <Section
          title="Poliçe bitişleri"
          hint="DASK/konut poliçesi bitince kira sözleşmesi riskte kalır; 30 gün önce haber verilir."
          action={{ label: "Poliçeler'e git", onClick: () => go("policeler") }}
        >
          <ul className="action-list">
            {today.policies.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.propertyTitle}</strong>
                  {row.district && <span className="muted small"> ({row.district})</span>}
                </div>
                <div className="muted small">
                  {row.endDate} ·{" "}
                  {row.daysLeft < 0
                    ? `${Math.abs(row.daysLeft)} gün önce bitti`
                    : row.daysLeft === 0
                      ? "bugün bitiyor"
                      : `${row.daysLeft} gün kaldı`}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="muted small">
        Not: tutarlar kuruş hassasiyetinde saklanır; ana sayfada yalnız gösterilir.
      </p>
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

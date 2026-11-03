import { useEffect, useRef, useState } from "react";
import { api, type Session, type Today } from "./api";
import { IdleLock, useIdleLock } from "./components/IdleLock";
import { Contracts } from "./pages/Contracts";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { Import } from "./pages/Import";
import { Listings } from "./pages/Listings";
import { Owners } from "./pages/Owners";
import { Login } from "./pages/Login";
import { Payouts } from "./pages/Payouts";
import { PasswordChange } from "./pages/PasswordChange";
import { People } from "./pages/People";
import { Roadmap } from "./pages/Roadmap";
import { Policies } from "./pages/Policies";
import { Appointments } from "./pages/Appointments";
import { CalendarPage } from "./pages/Calendar";
import { Rents } from "./pages/Rents";
import { Team } from "./pages/Team";

type Page =
  | "bugun"
  | "portfoy"
  | "satiliklar"
  | "kiraliklar"
  | "mal-sahipleri"
  | "kisiler"
  | "kiralar"
  | "sozlesmeler"
  | "policeler"
  | "sahipler"
  | "belgeler"
  | "aktar"
  | "takvim"
  | "randevular"
  | "yol-haritasi"
  | "ekip";

/** Kaynak dosya 6.2: düz 15 maddelik menü değil, 6 grup. */
const NAV: Array<{ group: string; items: Array<{ page: Page; label: string }> }> = [
  {
    group: "Bugün",
    items: [
      { page: "bugun", label: "Aksiyon panosu" },
      { page: "takvim", label: "Takvim" },
      { page: "randevular", label: "Randevular" },
    ],
  },
  {
    group: "Portföy",
    items: [
      { page: "portfoy", label: "Gayrimenkuller" },
      { page: "satiliklar", label: "Satılıklar" },
      { page: "kiraliklar", label: "Kiralıklar" },
    ],
  },
  {
    group: "Kişiler",
    items: [
      { page: "mal-sahipleri", label: "Mal sahipleri / kiracılar" },
      { page: "kisiler", label: "Kişi kartları" },
    ],
  },
  { group: "Ofis", items: [{ page: "ekip", label: "Personeller" }] },
  {
    group: "Para",
    items: [
      { page: "kiralar", label: "Kiralar / tahsilat" },
      { page: "sahipler", label: "Sahibe aktarım" },
    ],
  },
  {
    group: "Operasyon",
    items: [
      { page: "sozlesmeler", label: "Sözleşmeler" },
      { page: "policeler", label: "Poliçeler / DASK" },
    ],
  },
  {
    group: "Sistem",
    items: [
      { page: "belgeler", label: "Belgeler / arşiv" },
      { page: "aktar", label: "İçe aktar" },
      { page: "yol-haritasi", label: "Yol haritası" },
    ],
  },
];

const TITLES: Record<Page, string> = {
  bugun: "Bugün",
  takvim: "Takvim",
  randevular: "Randevular",
  portfoy: "Portföy",
  satiliklar: "Satılıklar",
  kiraliklar: "Kiralıklar",
  "mal-sahipleri": "Mal Sahipleri",
  kisiler: "Kişiler",
  kiralar: "Kiralar",
  sozlesmeler: "Sözleşmeler",
  policeler: "Poliçeler",
  sahipler: "Sahipler",
  belgeler: "Belgeler",
  aktar: "İçe Aktar",
  "yol-haritasi": "Yol Haritası",
  ekip: "Personeller",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr"))
    .join("");
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("bugun");
  /** TUR:21 — geri tuşu: sayfa geçmişi (detay panelleri kendi geri tuşunu taşır). */
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [search, setSearch] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [actionCount, setActionCount] = useState(0);
  const [changePassword, setChangePassword] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const idle = useIdleLock();

  useEffect(() => {
    api<Session>("/auth/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  // Bildirim sayacı: "bugün" işlerinin toplamı
  useEffect(() => {
    if (!session) return;
    void api<Today>("/today")
      .then((data) => {
        const c = data.counts;
        setActionCount(
          c.overdue +
            c.dueSoon +
            c.missingDocs +
            c.pendingMatches +
            c.draftPayouts +
            c.expiringContracts +
            c.policyWarnings,
        );
      })
      .catch(() => setActionCount(0));
  }, [session, page]);

  // Kaynak dosya 6.1: "/" ile aramaya, Esc ile kapat
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <div className="center muted">Yükleniyor…</div>;
  if (!session) return <Login onLogin={setSession} />;

  // Y-02: geçici şifreli hesap, şifresini değiştirmeden hiçbir veri ucuna giremez.
  if (session.mustChangePassword) {
    return (
      <PasswordChange
        forced
        name={session.user.name}
        email={session.user.email}
        onDone={setSession}
        onLogout={async () => {
          await api("/auth/logout", { method: "POST" }).catch(() => null);
          setSession(null);
        }}
      />
    );
  }

  if (changePassword) {
    return (
      <PasswordChange
        name={session.user.name}
        email={session.user.email}
        onDone={(next) => {
          setSession(next);
          setChangePassword(false);
        }}
        onClose={() => setChangePassword(false)}
      />
    );
  }

  function go(next: Page) {
    if (next === page) return;
    setPageHistory((history) => [...history, page]);
    setPage(next);
  }

  // TUR:24 — kullanıcı isteği: "sayfalara girince geri çıkamıyoruz". Geçmiş boşsa
  // geri tuşu artık ana sayfaya döner; hiçbir zaman ölü düğme gibi görünmez.
  function goBack() {
    const previous = pageHistory[pageHistory.length - 1];
    if (!previous) {
      setPage("bugun");
      return;
    }
    setPageHistory((history) => history.slice(0, -1));
    setPage(previous);
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    setPeopleQuery(term);
    go("kisiler");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <img src="/brand/tm-mark.jpeg" alt="Trademark Gayrimenkul" className="brand-logo" />
          <span className="brand-block">
            <span className="brand-name">TRADEMARK</span>
            <span className="brand-sub">GAYRİMENKUL</span>
          </span>
        </div>
        <button
          type="button"
          className="ghost back-nav"
          disabled={page === "bugun" && pageHistory.length === 0}
          onClick={goBack}
          title="Önceki ekrana dön (geçmiş boşsa ana sayfa)"
        >
          ← Geri
        </button>
        <form className="global-search" onSubmit={runSearch}>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara: kişi, telefon, mülk…  ( / )"
            aria-label="Genel arama"
          />
        </form>
        <div className="topbar-right">
          <button
            type="button"
            className="icon-btn"
            title="Bugünün işleri"
            onClick={() => go("bugun")}
          >
            Bildirim
            {actionCount > 0 && <span className="count">{actionCount}</span>}
          </button>
          <div className="profile">
            <span className="avatar">{initials(session.user.name)}</span>
            <span>
              <div>{session.user.name}</div>
              <div className="muted small">{session.tenant.name}</div>
            </span>
          </div>
          <button type="button" className="ghost" onClick={() => setChangePassword(true)}>
            Şifre
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" }).catch(() => null);
              setSession(null);
            }}
          >
            Çıkış
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="side">
          <nav>
            {NAV.map((group) => (
              <div className="nav-group" key={group.group}>
                <div className="nav-group-title">{group.group}</div>
                {group.items.map((item) => (
                  <button
                    key={item.page}
                    type="button"
                    className={page === item.page ? "active" : ""}
                    onClick={() => go(item.page)}
                  >
                    <span className="nav-dot" />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <span>{TITLES[page]}</span>
            <span>
              {session.role === "owner" ? "Ofis sahibi" : session.role}
              {session.canApprove ? " · onay yetkisi var" : " · onay yetkisi yok"}
            </span>
            <a
              className="muted small"
              href="https://tmgayrimenkul.com"
              target="_blank"
              rel="noreferrer"
            >
              TM Gayrimenkul · tmgayrimenkul.com
            </a>
          </div>
        </aside>

        <main>
          {page === "bugun" && <Dashboard onGo={(next) => go(next as Page)} />}
          {page === "portfoy" && <Listings canApprove={session.canApprove} />}
          {page === "satiliklar" && (
            <Listings canApprove={session.canApprove} fixedKind="sale" />
          )}
          {page === "kiraliklar" && (
            <Listings canApprove={session.canApprove} fixedKind="rent" />
          )}
          {page === "mal-sahipleri" && <Owners />}
          {page === "kisiler" && <People initialQuery={peopleQuery} />}
          {page === "kiralar" && <Rents />}
          {page === "sozlesmeler" && <Contracts canApprove={session.canApprove} />}
          {page === "policeler" && <Policies />}
          {page === "sahipler" && <Payouts />}
          {page === "belgeler" && <Documents canApprove={session.canApprove} />}
          {page === "aktar" && <Import />}
          {page === "takvim" && <CalendarPage onGo={(next) => go(next as Page)} />}
          {page === "randevular" && <Appointments />}
          {page === "yol-haritasi" && <Roadmap />}
          {page === "ekip" && (
            <Team
              canApprove={session.canApprove}
              isOwner={session.role === "owner"}
              selfEmail={session.user.email}
            />
          )}
        </main>
      </div>
      {idle.locked && <IdleLock name={session.user.name} onUnlock={idle.unlock} />}
    </div>
  );
}

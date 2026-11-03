import { useEffect, useRef, useState } from "react";
import { api, type Session, type Today } from "./api";
import { IdleLock, useIdleLock } from "./components/IdleLock";
import { Contracts } from "./pages/Contracts";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { Import } from "./pages/Import";
import { Listings } from "./pages/Listings";
import { Login } from "./pages/Login";
import { Payouts } from "./pages/Payouts";
import { PasswordChange } from "./pages/PasswordChange";
import { People } from "./pages/People";
import { Rents } from "./pages/Rents";
import { Team } from "./pages/Team";

type Page =
  | "bugun"
  | "portfoy"
  | "kisiler"
  | "kiralar"
  | "sozlesmeler"
  | "sahipler"
  | "belgeler"
  | "aktar"
  | "ekip";

/** Kaynak dosya 6.2: düz 15 maddelik menü değil, 6 grup. */
const NAV: Array<{ group: string; items: Array<{ page: Page; label: string }> }> = [
  { group: "Bugün", items: [{ page: "bugun", label: "Aksiyon panosu" }] },
  { group: "Portföy", items: [{ page: "portfoy", label: "Gayrimenkuller" }] },
  { group: "Kişiler", items: [{ page: "kisiler", label: "Mal sahibi / kiracı" }] },
  { group: "Ofis", items: [{ page: "ekip", label: "Personeller" }] },
  {
    group: "Para",
    items: [
      { page: "kiralar", label: "Kiralar / tahsilat" },
      { page: "sahipler", label: "Sahibe aktarım" },
    ],
  },
  { group: "Operasyon", items: [{ page: "sozlesmeler", label: "Sözleşmeler" }] },
  {
    group: "Sistem",
    items: [
      { page: "belgeler", label: "Belgeler / arşiv" },
      { page: "aktar", label: "İçe aktar" },
    ],
  },
];

const TITLES: Record<Page, string> = {
  bugun: "Bugün",
  portfoy: "Portföy",
  kisiler: "Kişiler",
  kiralar: "Kiralar",
  sozlesmeler: "Sözleşmeler",
  sahipler: "Sahipler",
  belgeler: "Belgeler",
  aktar: "İçe Aktar",
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
          c.overdue + c.dueSoon + c.missingDocs + c.pendingMatches + c.draftPayouts + c.expiringContracts,
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

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    setPeopleQuery(term);
    setPage("kisiler");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          UMAY <span>EMLAK</span>
        </div>
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
            onClick={() => setPage("bugun")}
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
                    onClick={() => setPage(item.page)}
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
          </div>
        </aside>

        <main>
          {page === "bugun" && <Dashboard onGo={(next) => setPage(next as Page)} />}
          {page === "portfoy" && <Listings canApprove={session.canApprove} />}
          {page === "kisiler" && <People initialQuery={peopleQuery} />}
          {page === "kiralar" && <Rents />}
          {page === "sozlesmeler" && <Contracts />}
          {page === "sahipler" && <Payouts />}
          {page === "belgeler" && <Documents canApprove={session.canApprove} />}
          {page === "aktar" && <Import />}
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

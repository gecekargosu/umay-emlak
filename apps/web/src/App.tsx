import { useEffect, useState } from "react";
import { api, type Session } from "./api";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { Import } from "./pages/Import";
import { Listings } from "./pages/Listings";
import { Login } from "./pages/Login";
import { People } from "./pages/People";

type Page = "pano" | "portfoy" | "kisiler" | "belgeler" | "aktar";

const TITLES: Record<Page, string> = {
  pano: "Pano",
  portfoy: "Portföy",
  kisiler: "Kişiler",
  belgeler: "Belgeler",
  aktar: "İçe Aktar",
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("pano");

  useEffect(() => {
    api<Session>("/auth/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center muted">Yükleniyor…</div>;
  if (!session) return <Login onLogin={setSession} />;

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          UMAY <span>EMLAK</span>
        </div>
        <nav>
          {(Object.keys(TITLES) as Page[]).map((key) => (
            <button
              key={key}
              type="button"
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              {TITLES[key]}
            </button>
          ))}
        </nav>
        <div className="who">
          <div>{session.user.name}</div>
          <div className="muted small">{session.tenant.name}</div>
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
      </aside>

      <main>
        {page === "pano" && <Dashboard />}
        {page === "portfoy" && <Listings canApprove={session.canApprove} />}
        {page === "kisiler" && <People />}
        {page === "belgeler" && <Documents canApprove={session.canApprove} />}
        {page === "aktar" && <Import />}
      </main>
    </div>
  );
}

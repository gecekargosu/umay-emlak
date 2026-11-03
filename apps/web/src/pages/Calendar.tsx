import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BackButton } from "../components/BackButton";

/**
 * Takvim — TUR:26.
 * Kullanıcı isteği: "kira günleri işaretli, hatırlatıcılar olsun, işaretli güne
 * tıklayınca o günün tüm işleri görünsün; ay görünümü + yanında gün ve notlar."
 *
 * Sol: ay ızgarası (Pazartesi başlar). Sağ: seçili günün işleri.
 * `compact` = ana sayfaya gömülü küçük sürüm (ay + seçili gün özeti).
 */
type CalendarItem = {
  type: "rent" | "contract-end" | "contract-start" | "appointment";
  title: string;
  sub: string;
  date: string;
  amountKurus: number;
  amountText: string | null;
  page: string;
  urgent: boolean;
};

type CalendarData = {
  month: string;
  monthLabel: string;
  days: Array<{
    date: string;
    items: CalendarItem[];
    rentCount: number;
    rentKurus: number;
    rentText: string;
  }>;
  totals: {
    rentCount: number;
    rentKurus: number;
    rentText: string;
    contractCount: number;
    itemCount: number;
  };
};

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Ayın günleri, Pazartesi ilk sütun olacak şekilde (0 = boş hücre). */
function buildGrid(month: string): Array<string | null> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  // JS: 0 = Pazar; bizde Pazartesi 0.
  const offset = (first.getUTCDay() + 6) % 7;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= lastDay; day++) {
    cells.push(`${month}-${pad(day)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function Calendar({ compact = false, onGo }: { compact?: boolean; onGo?: (page: string) => void }) {
  const today = new Date();
  const [month, setMonth] = useState(monthKey(today));
  const [data, setData] = useState<CalendarData | null>(null);
  const [selected, setSelected] = useState<string>(`${monthKey(today)}-${pad(today.getDate())}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: string) => {
    setBusy(true);
    try {
      const result = await api<CalendarData>(`/calendar?month=${key}`);
      setData(result);
      setError(null);
      return result;
    } catch {
      setError("Takvim yüklenemedi");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarData["days"][number]>();
    for (const day of data?.days ?? []) map.set(day.date, day);
    return map;
  }, [data]);

  const grid = useMemo(() => buildGrid(month), [month]);
  const selectedItems = byDate.get(selected)?.items ?? [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function goMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(`${next}-01`);
  }

  function goToday() {
    const key = monthKey(today);
    setMonth(key);
    setSelected(`${key}-${pad(today.getDate())}`);
  }

  const todayKey = `${monthKey(today)}-${pad(today.getDate())}`;

  return (
    <section className={`calendar${compact ? " compact" : ""}`}>
      <div className="cal-head">
        <div>
          <h3>Takvim</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {data?.monthLabel ?? "…"} · {data?.totals.rentCount ?? 0} kira günü ·{" "}
            {data?.totals.rentText ?? "0,00 ₺"}
          </p>
        </div>
        <div className="cal-nav">
          <button type="button" className="ghost" onClick={() => goMonth(-1)} title="Önceki ay">
            ←
          </button>
          <button type="button" className="secondary" onClick={goToday} disabled={busy}>
            Bugün
          </button>
          <button type="button" className="ghost" onClick={() => goMonth(1)} title="Sonraki ay">
            →
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="cal-body">
        <div className="cal-month">
          <div className="cal-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="cal-grid">
            {grid.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} className="cal-day empty" />;
              const day = byDate.get(date);
              const isToday = date === todayKey;
              const isSelected = date === selected;
              const items = day?.items ?? [];
              return (
                <button
                  key={date}
                  type="button"
                  className={`cal-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}${
                    items.length > 0 ? " has-items" : ""
                  }`}
                  onClick={() => setSelected(date)}
                  title={
                    items.length > 0
                      ? `${items.length} iş: ${items.map((i) => i.title).join(", ")}`
                      : "iş yok"
                  }
                >
                  <span className="cal-day-num">{Number(date.slice(-2))}</span>
                  {day && day.rentCount > 0 && (
                    <span className="cal-badge rent">{day.rentCount} kira</span>
                  )}
                  {items.some((i) => i.type === "contract-end") && (
                    <span className="cal-badge contract">bitiş</span>
                  )}
                  {items.some((i) => i.type === "appointment") && (
                    <span className="cal-badge soft">randevu</span>
                  )}
                  {items.some((i) => i.type === "contract-start") && !day?.rentCount && (
                    <span className="cal-badge soft">başlangıç</span>
                  )}
                </button>
              );
            })}
          </div>
          {!compact && (
            <p className="hint">
              Kırmızı rozet: o gün kira var. Sarı: sözleşme bitiyor. Güne tıkla, yandaki panelde
              o günün tüm işleri görünür.
            </p>
          )}
        </div>

        <aside className="cal-day-panel">
          <div className="cal-day-head">
            <strong>{selectedLabel}</strong>
            <span className="muted small">
              {selectedItems.length} iş
              {byDate.get(selected) && byDate.get(selected)!.rentKurus > 0
                ? ` · ${byDate.get(selected)!.rentText}`
                : ""}
            </span>
          </div>

          {selectedItems.length === 0 && (
            <p className="muted small">
              Bu gün için kayıt yok. Kira günleri sözleşmedeki güne göre burada görünür.
            </p>
          )}

          <ul className="cal-items">
            {selectedItems.map((item, index) => (
              <li key={`${item.type}-${index}`} className={item.urgent ? "urgent" : ""}>
                <div className="cal-item-title">
                  {item.type === "rent"
                    ? "₺"
                    : item.type === "contract-end"
                      ? "⏳"
                      : item.type === "appointment"
                        ? "📅"
                        : "📄"}{" "}
                  {item.title}
                </div>
                <div className="muted small">{item.sub}</div>
                {item.amountText && <div className="cal-amount">{item.amountText}</div>}
                {onGo && (
                  <button
                    type="button"
                    className="ghost small-btn"
                    onClick={() => onGo(item.page)}
                  >
                    {item.page === "kiralar"
                      ? "Tahsilata git"
                      : item.page === "randevular"
                        ? "Randevuya git"
                        : "Sözleşmeye git"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {compact && onGo && (
            <button type="button" className="secondary" onClick={() => onGo("takvim")}>
              Takvimi aç
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

/** Yeni sayfadaki tam sürüm: başlık + geri tuşu. */
export function CalendarPage({ onBack, onGo }: { onBack?: () => void; onGo?: (page: string) => void }) {
  return (
    <div>
      <div className="page-head">
        <h2>Takvim</h2>
        <span className="spacer" />
        <span className="muted small">kira günleri · sözleşme başlangıç/bitiş</span>
      </div>
      <BackButton onBack={onBack} label="Geri" />
      <Calendar onGo={onGo} />
    </div>
  );
}

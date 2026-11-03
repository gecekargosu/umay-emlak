import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Appointment, type ListingRow, type PersonRow } from "../api";

/**
 * Randevular — TUR:31 (yol haritası SIRA 5).
 * Aday + portföy + personel + zaman; sonuç (geldi / gelmedi / iptal) kayda geçer.
 * "Müşteri geldi, beğendi" notu saklanır; sonuçtan teklife geçilebilir.
 */

type Member = { id: string; name: string; role: string; status: string };

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "Tümü" },
  { key: "planned", label: "Planlanan" },
  { key: "done", label: "Geldi" },
  { key: "no_show", label: "Gelmedi" },
  { key: "cancelled", label: "İptal" },
];

function todayTimeLocal(offsetHours = 1): string {
  const d = new Date();
  d.setHours(d.getHours() + offsetHours, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function Appointments() {
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    personId: "",
    listingId: "",
    staffUserId: "",
    scheduledAt: todayTimeLocal(),
    durationMin: 30,
    place: "",
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Appointment[] }>(
        `/appointments${filter ? `?status=${filter}` : ""}`,
      );
      setItems(data.items);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api<{ items: PersonRow[] }>("/people")
      .then((data) =>
        setPeople(
          [...data.items].sort((a, b) => a.fullName.localeCompare(b.fullName, "tr")),
        ),
      )
      .catch(() => setPeople([]));
    void api<{ items: ListingRow[] }>("/listings")
      .then((data) =>
        setListings(data.items.filter((row) => row.status !== "closed" && row.status !== "archived")),
      )
      .catch(() => setListings([]));
    void api<{ members: Member[] }>("/team")
      .then((data) => setMembers(data.members.filter((m) => m.status === "active")))
      .catch(() => setMembers([]));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const row of items ?? []) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  async function create() {
    if (!form.personId) {
      setError("Aday/müşteri seçin");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          personId: form.personId,
          listingId: form.listingId || null,
          staffUserId: form.staffUserId || null,
          scheduledAt: form.scheduledAt,
          durationMin: Number(form.durationMin),
          place: form.place || undefined,
        }),
      });
      setMessage("Randevu kaydedildi.");
      setForm({ ...form, place: "" });
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: Appointment, status: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/appointments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          resultNote: notes[row.id] || undefined,
        }),
      });
      setMessage(
        status === "done"
          ? "Randevu “geldi” olarak işlendi."
          : status === "no_show"
            ? "Randevu “gelmedi” olarak işlendi."
            : "Randevu iptal edildi.",
      );
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!items && error) return <div className="error">{error}</div>;

  return (
    <div className="appointments-page">
      <div className="page-head">
        <h2>Randevular</h2>
        <span className="muted small">{(items ?? []).length} kayıt</span>
      </div>

      <p className="info-note">
        Adayı, gösterilecek portföyü ve gidecek personeli seç; randevu takvime düşer.
        Sonucu buradan işaretle: <strong>geldi</strong>, <strong>gelmedi</strong> veya{" "}
        <strong>iptal</strong>. Not alanına “ne konuşuldu” yazılır; sonuç kaydı silinmez.
      </p>

      <section className="panel">
        <h3>Yeni randevu</h3>
        <div className="inline-form">
          <select
            value={form.personId}
            onChange={(e) => setForm({ ...form, personId: e.target.value })}
          >
            <option value="">Aday / müşteri seçin</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
                {person.phone ? ` · ${person.phone}` : ""}
              </option>
            ))}
          </select>
          <select
            value={form.listingId}
            onChange={(e) => setForm({ ...form, listingId: e.target.value })}
          >
            <option value="">Portföy (isteğe bağlı)</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title} · {listing.kind === "rent" ? "kiralık" : "satılık"}
              </option>
            ))}
          </select>
          <select
            value={form.staffUserId}
            onChange={(e) => setForm({ ...form, staffUserId: e.target.value })}
          >
            <option value="">Personel (ben)</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-form">
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            aria-label="Randevu zamanı"
          />
          <select
            value={String(form.durationMin)}
            onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
          >
            {[15, 30, 45, 60, 90].map((min) => (
              <option key={min} value={min}>
                {min} dakika
              </option>
            ))}
          </select>
          <input
            placeholder="Yer (örn. ofis, daire adresi)"
            value={form.place}
            onChange={(e) => setForm({ ...form, place: e.target.value })}
          />
          <button type="button" disabled={busy} onClick={() => void create()}>
            Randevu ekle
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
        {message && <p className="muted small">{message}</p>}
      </section>

      <section className="panel">
        <div className="detail-head">
          <h3>Randevu listesi</h3>
          <div className="row-gap" style={{ marginTop: 0 }}>
            {FILTERS.map((item) => (
              <button
                key={item.key || "all"}
                type="button"
                className={`chip${filter === item.key ? " active" : ""}`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!items ? (
          <p className="muted">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="muted small">Bu aralıkta randevu yok.</p>
        ) : (
          grouped.map(([date, rows]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              <h4 style={{ textTransform: "capitalize" }}>{dateLabel(date)}</h4>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Saat</th>
                      <th>Aday / müşteri</th>
                      <th>Portföy</th>
                      <th>Personel</th>
                      <th>Yer</th>
                      <th>Durum</th>
                      <th>Sonuç notu / işlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.time}
                          <div className="muted small">{row.durationMin} dk</div>
                        </td>
                        <td>
                          <strong>{row.personName}</strong>
                          {row.personPhone && (
                            <div className="muted small">{row.personPhone}</div>
                          )}
                        </td>
                        <td>
                          {row.propertyTitle ?? "—"}
                          {row.district && <div className="muted small">{row.district}</div>}
                        </td>
                        <td>{row.staffName ?? "—"}</td>
                        <td>{row.place ?? "—"}</td>
                        <td>
                          <span className={`badge${row.status === "no_show" ? " danger" : ""}`}>
                            {row.statusLabel}
                          </span>
                        </td>
                        <td>
                          {row.status === "planned" ? (
                            <div className="row-gap" style={{ marginTop: 0 }}>
                              <input
                                placeholder="Ne konuşuldu?"
                                value={notes[row.id] ?? ""}
                                onChange={(e) =>
                                  setNotes({ ...notes, [row.id]: e.target.value })
                                }
                              />
                              <button
                                type="button"
                                className="small-btn"
                                disabled={busy}
                                onClick={() => void setStatus(row, "done")}
                              >
                                Geldi
                              </button>
                              <button
                                type="button"
                                className="small-btn"
                                disabled={busy}
                                onClick={() => void setStatus(row, "no_show")}
                              >
                                Gelmedi
                              </button>
                              <button
                                type="button"
                                className="small-btn"
                                disabled={busy}
                                onClick={() => void setStatus(row, "cancelled")}
                              >
                                İptal
                              </button>
                            </div>
                          ) : (
                            <span className="muted small">{row.resultNote ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

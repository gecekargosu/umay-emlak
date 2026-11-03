/**
 * Takvim ucu — TUR:26 (kullanıcı isteği: "takvim eklemeliyiz, kira günleri işaretli,
 * hatırlatıcılar olsun, güne tıklayınca o günün tüm işleri görünsün").
 *
 * Kural: burada hesap yapılmaz; yalnız tarihli kayıtlar toplanır.
 * Kaynaklar: kira tahakkuku (charge.due_date), sözleşme başlangıcı/bitişi.
 * Para kuruş (K-13), gösterim biçimlendirilmiş.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant } from "@umay/db";
import { formatTry } from "@umay/shared";
import { HttpError, requirePasswordChanged, resolveSession } from "../session.js";

export const calendarRoutes = new Hono();

const MONTH_RE = /^\d{4}-\d{2}$/;

type CalendarItem = {
  type: "rent" | "contract-end" | "contract-start" | "appointment";
  title: string;
  sub: string;
  date: string;
  amountKurus: number;
  amountText: string | null;
  page: "kiralar" | "sozlesmeler" | "randevular";
  /** Ödenmemiş kira / biten sözleşme gibi acil olanlar */
  urgent: boolean;
};

function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

calendarRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const raw = (c.req.query("month") ?? "").trim();
  if (raw && !MONTH_RE.test(raw)) throw new HttpError(400, "month YYYY-MM olmalı");
  const month = raw || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(month);

  const data = await withTenant(session.tenantId, async (tx) => {
    const rentResult = await tx.execute(sql`
      select ch.id, ch.due_date::text as date, ch.amount_kurus,
             coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
               as paid_kurus,
             per.full_name as tenant_name,
             prop.title as property_title,
             prop.district
        from charge ch
        join contract k on k.id = ch.contract_id
        join person per on per.id = k.tenant_person_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where ch.due_date between ${start}::date and ${end}::date
       order by ch.due_date, per.full_name
    `);
    const rents = (
      rentResult as unknown as {
        rows: Array<{
          id: string;
          date: string;
          amount_kurus: string;
          paid_kurus: string;
          tenant_name: string;
          property_title: string;
          district: string | null;
        }>;
      }
    ).rows;

    const contractResult = await tx.execute(sql`
      select k.id, k.start_date::text as start_date, k.end_date::text as end_date,
             per.full_name as tenant_name, prop.title as property_title
        from contract k
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
        join person per on per.id = k.tenant_person_id
       where k.status = 'active'
         and (k.end_date between ${start}::date and ${end}::date
              or k.start_date between ${start}::date and ${end}::date)
       order by k.end_date
    `);
    const contracts = (
      contractResult as unknown as {
        rows: Array<{
          id: string;
          start_date: string;
          end_date: string | null;
          tenant_name: string;
          property_title: string;
        }>;
      }
    ).rows;

    // TUR:32 — randevular takvimde: saatli iş olarak gün panelinde görünür.
    const appointmentResult = await tx.execute(sql`
      select a.id, a.status, a.place,
             to_char(a.scheduled_at at time zone 'Europe/Istanbul', 'HH24:MI') as time,
             (a.scheduled_at at time zone 'Europe/Istanbul')::date::text as date,
             per.full_name as person_name,
             prop.title as property_title, prop.district
        from appointment a
        join person per on per.id = a.person_id
        left join listing l on l.id = a.listing_id
        left join property prop on prop.id = l.property_id
       where a.scheduled_at >= ${start}::date
         and a.scheduled_at < (${end}::date + 1)
         and a.status <> 'cancelled'
       order by a.scheduled_at
    `);
    const appointments = (
      appointmentResult as unknown as {
        rows: Array<{
          id: string;
          status: string;
          place: string | null;
          time: string;
          date: string;
          person_name: string;
          property_title: string | null;
          district: string | null;
        }>;
      }
    ).rows;

    return { rents, contracts, appointments };
  });

  const items: CalendarItem[] = [];

  for (const row of data.rents) {
    const amountKurus = Number(row.amount_kurus);
    const paidKurus = Number(row.paid_kurus);
    const remaining = Math.max(0, amountKurus - paidKurus);
    items.push({
      type: "rent",
      title: `${row.tenant_name} · kira`,
      sub: `${row.property_title}${row.district ? ` (${row.district})` : ""}${paidKurus > 0 ? ` · kalan ${formatTry(remaining)}` : ""}`,
      date: row.date,
      amountKurus: remaining,
      amountText: formatTry(remaining),
      page: "kiralar",
      urgent: true,
    });
  }

  for (const row of data.contracts) {
    if (row.end_date && row.end_date >= start && row.end_date <= end) {
      items.push({
        type: "contract-end",
        title: `${row.tenant_name} · sözleşme bitiyor`,
        sub: `${row.property_title} · yenileme veya çıkış konuşulmalı`,
        date: row.end_date,
        amountKurus: 0,
        amountText: null,
        page: "sozlesmeler",
        urgent: true,
      });
    }
    if (row.start_date >= start && row.start_date <= end) {
      items.push({
        type: "contract-start",
        title: `${row.tenant_name} · sözleşme başlangıcı`,
        sub: `${row.property_title} · teslim tutanağı hazırlanmalı`,
        date: row.start_date,
        amountKurus: 0,
        amountText: null,
        page: "sozlesmeler",
        urgent: false,
      });
    }
  }

  for (const row of data.appointments) {
    const place = [row.property_title, row.district, row.place].filter(Boolean).join(" · ");
    items.push({
      type: "appointment",
      title: `${row.person_name} · randevu ${row.time}`,
      sub: place || "yer belirtilmedi",
      date: row.date,
      amountKurus: 0,
      amountText: null,
      page: "randevular",
      urgent: false,
    });
  }

  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      items: list,
      rentCount: list.filter((i) => i.type === "rent").length,
      rentKurus: list.reduce((sum, i) => sum + i.amountKurus, 0),
      rentText: formatTry(list.reduce((sum, i) => sum + i.amountKurus, 0)),
    }));

  const rentTotal = items.filter((i) => i.type === "rent").reduce((s, i) => s + i.amountKurus, 0);

  return c.json({
    month,
    monthLabel: new Date(`${month}-01T00:00:00`).toLocaleDateString("tr-TR", {
      month: "long",
      year: "numeric",
    }),
    start,
    end,
    days,
    totals: {
      rentCount: items.filter((i) => i.type === "rent").length,
      rentKurus: rentTotal,
      rentText: formatTry(rentTotal),
      contractCount: items.filter((i) => i.type !== "rent").length,
      itemCount: items.length,
    },
  });
});

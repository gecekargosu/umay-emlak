/**
 * "Bugün ne yapılmalı" — M10 / Y-10.
 *
 * Pano sayı gösteriyordu; iş göstermiyordu. Bu uç, ofisin bugün bakması
 * gereken SOMUT kayıtları döndürür: gecikmiş kira, bu hafta vadesi gelen,
 * belgesi eksik portföy, onay bekleyen eşleştirme, taslak aktarım,
 * bitmek üzere olan sözleşme.
 *
 * Kural: burada hesap yapılmaz, karar verilmez. Liste + gerekçe döner;
 * eylem ilgili ekranda yapılır (K-29 onay yetkisi orada uygulanır).
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { withTenant } from "@umay/db";
import {
  formatPeriodTr,
  formatTry,
  missingRequirements,
  requiredForListing,
  type DocumentKind,
} from "@umay/shared";
import { requirePasswordChanged, resolveSession } from "../session.js";

export const todayRoutes = new Hono();

type ChargeRow = {
  id: string;
  period: string;
  due_date: string;
  amount_kurus: string;
  paid_kurus: string;
  tenant_name: string;
  tenant_phone: string | null;
  property_title: string;
  district: string | null;
  days_overdue: number;
  notice_sent_at: string | null;
};

/** Ana sayfa modül sayıları (kaynak dosya 6.4 "ana sayfa nasıl olmalı"). */
type ModuleRow = {
  owners: number;
  properties_total: number;
  sale: number;
  rent: number;
  occupied: number;
  staff: number;
  approvers: number;
  active_contracts: number;
  expiring: number;
  active_tenants: number;
  listings_total: number;
  payout_paid: string;
  payout_draft: string;
  commission: string;
  policies_total: number;
  policies_warning: number;
};

type ListingRow = {
  id: string;
  kind: "sale" | "rent";
  status: string;
  title: string;
  property_id: string;
};

type DocRow = { kind: string; listing_id: string | null; property_id: string | null };

todayRoutes.get("/", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);

  const data = await withTenant(session.tenantId, async (tx) => {
    const chargesResult = await tx.execute(sql`
      select ch.id, ch.period, ch.due_date, ch.amount_kurus,
             coalesce((select sum(p.amount_kurus) from payment p where p.charge_id = ch.id), 0)::bigint
               as paid_kurus,
             per.full_name as tenant_name, per.phone as tenant_phone,
             prop.title as property_title, prop.district as district,
             (current_date - ch.due_date)::int as days_overdue,
             ch.notice_sent_at
        from charge ch
        join contract k on k.id = ch.contract_id
        join person per on per.id = k.tenant_person_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where ch.status in ('open', 'partial')
       order by ch.due_date asc
       limit 100
    `);
    const charges = (chargesResult as unknown as { rows: ChargeRow[] }).rows;

    const listingsResult = await tx.execute(sql`
      select l.id, l.kind, l.status, p.title, l.property_id
        from listing l
        join property p on p.id = l.property_id
       where l.status in ('draft', 'active')
       order by l.created_at desc
       limit 100
    `);
    const listings = (listingsResult as unknown as { rows: ListingRow[] }).rows;

    const docsResult = await tx.execute(sql`
      select kind, listing_id, property_id from document
    `);
    const docs = (docsResult as unknown as { rows: DocRow[] }).rows;

    const suggestionsResult = await tx.execute(sql`
      select ds.id, ds.score,
             coalesce(d.title, d.filename) as document_title,
             d.id as document_id
        from document_suggestion ds
        join document d on d.id = ds.document_id
       where ds.status = 'pending'
       order by ds.score desc
       limit 10
    `);
    const pending = (
      suggestionsResult as unknown as {
        rows: Array<{ id: string; score: number; document_title: string; document_id: string }>;
      }
    ).rows;

    const payoutsResult = await tx.execute(sql`
      select op.id, op.period, op.net_kurus, prop.title as property_title
        from owner_payout op
        join contract k on k.id = op.contract_id
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where op.status = 'draft'
       order by op.period asc
       limit 10
    `);
    const payouts = (
      payoutsResult as unknown as {
        rows: Array<{ id: string; period: string; net_kurus: string; property_title: string }>;
      }
    ).rows;

    // TUR:29 — poliçe bitiş takibi (SIRA 3): 30 gün içinde biten + süresi geçmiş.
    const policiesResult = await tx.execute(sql`
      select p.id, pr.title as property_title, pr.district, p.kind,
             p.end_date::text as end_date, (p.end_date - current_date)::int as days_left
        from policy p
        join property pr on pr.id = p.property_id
       where p.end_date <= current_date + 30
       order by p.end_date asc
       limit 10
    `);
    const policies = (
      policiesResult as unknown as {
        rows: Array<{
          id: string;
          property_title: string;
          district: string | null;
          kind: string;
          end_date: string;
          days_left: number;
        }>;
      }
    ).rows;

    const contractsResult = await tx.execute(sql`
      select k.id, k.end_date, (k.end_date - current_date)::int as days_left,
             prop.title as property_title
        from contract k
        join listing l on l.id = k.listing_id
        join property prop on prop.id = l.property_id
       where k.status = 'active' and k.end_date is not null
         and k.end_date <= current_date + 30
       order by k.end_date asc
       limit 10
    `);
    const contracts = (
      contractsResult as unknown as {
        rows: Array<{
          id: string;
          end_date: string;
          days_left: number;
          property_title: string;
        }>;
      }
    ).rows;

    // Ana sayfa modülleri: tek sorguda sayımlar. Modülü olmayanlar (DASK,
    // görev, mesaj) bilerek 0 değil "yok" olarak döner — sahte sıfır yazmayız.
    const moduleResult = await tx.execute(sql`
      select
        (select count(*) from person where kind = 'owner' and merged_into_id is null)::int as owners,
        (select count(*) from property)::int as properties_total,
        (select count(*) from listing where kind = 'sale'
            and status in ('draft','active','reserved'))::int as sale,
        (select count(*) from listing where kind = 'rent'
            and status in ('draft','active','reserved'))::int as rent,
        (select count(distinct l.property_id) from contract k
            join listing l on l.id = k.listing_id where k.status = 'active')::int as occupied,
        (select count(*) from membership where status = 'active')::int as staff,
        (select count(*) from membership where status = 'active' and can_approve)::int as approvers,
        (select count(*) from contract where status = 'active')::int as active_contracts,
        (select count(*) from contract where status = 'active' and end_date is not null
            and end_date <= current_date + 30)::int as expiring,
        (select count(distinct tenant_person_id) from contract where status = 'active')::int as active_tenants,
        (select count(*) from listing)::int as listings_total,
        (select coalesce(sum(net_kurus), 0)::bigint from owner_payout
           where period = date_trunc('month', current_date)::date and status = 'paid') as payout_paid,
        (select coalesce(sum(net_kurus), 0)::bigint from owner_payout
           where period = date_trunc('month', current_date)::date and status = 'draft') as payout_draft,
        (select coalesce(sum(amount_kurus), 0)::bigint from commission
           where status in ('approved', 'paid')) as commission,
        (select count(*) from policy)::int as policies_total,
        (select count(*) from policy where end_date <= current_date + 30)::int as policies_warning
    `);
    const modules = (moduleResult as unknown as { rows: ModuleRow[] }).rows[0]!;

    const monthResult = await tx.execute(sql`
      select coalesce(sum(ch.amount_kurus), 0)::bigint as charged,
             coalesce((select sum(p.amount_kurus)
                         from payment p join charge c2 on c2.id = p.charge_id
                        where c2.period = date_trunc('month', current_date)::date), 0)::bigint
               as collected
        from charge ch
       where ch.period = date_trunc('month', current_date)::date
    `);
    const month = (
      monthResult as unknown as { rows: Array<{ charged: string; collected: string }> }
    ).rows[0] ?? { charged: "0", collected: "0" };

    return { charges, listings, docs, pending, payouts, contracts, policies, month, modules };
  });

  // Belge eksiği: belge mülke de ilana da bağlı olabilir; ikisi de sayılır.
  const docsByListing = new Map<string, string[]>();
  const docsByProperty = new Map<string, string[]>();
  for (const doc of data.docs) {
    if (doc.listing_id) {
      docsByListing.set(doc.listing_id, [...(docsByListing.get(doc.listing_id) ?? []), doc.kind]);
    }
    if (doc.property_id) {
      docsByProperty.set(doc.property_id, [
        ...(docsByProperty.get(doc.property_id) ?? []),
        doc.kind,
      ]);
    }
  }

  const missingDocs = data.listings
    .map((listing) => {
      const present = [
        ...new Set([
          ...(docsByListing.get(listing.id) ?? []),
          ...(docsByProperty.get(listing.property_id) ?? []),
        ]),
      ] as DocumentKind[];
      const missing = missingRequirements(requiredForListing(listing.kind), present);
      return {
        listingId: listing.id,
        title: listing.title,
        status: listing.status,
        missing: missing.map((m) => m.label),
      };
    })
    .filter((row) => row.missing.length > 0)
    .slice(0, 10);

  const mapCharge = (row: ChargeRow) => {
    const amountKurus = Number(row.amount_kurus);
    const paidKurus = Number(row.paid_kurus);
    const remainingKurus = Math.max(0, amountKurus - paidKurus);
    const daysOverdue = Math.max(0, Number(row.days_overdue));
    return {
      id: row.id,
      tenantName: row.tenant_name,
      tenantPhone: row.tenant_phone,
      propertyTitle: row.property_title,
      district: row.district,
      remainingKurus,
      remaining: formatTry(remainingKurus),
      dueDate: row.due_date,
      daysOverdue,
      daysLeft: Math.max(0, -Number(row.days_overdue)),
      noticeSentAt: row.notice_sent_at,
      level: daysOverdue >= 15 ? "formal" : daysOverdue >= 3 ? "reminder" : null,
    };
  };

  const mapped = data.charges.map(mapCharge);
  const overdue = mapped.filter((ch) => ch.daysOverdue > 0);
  const dueSoon = mapped.filter((ch) => ch.daysOverdue === 0 && ch.daysLeft <= 7);

  const monthPeriod = `${new Date().toISOString().slice(0, 7)}-01`;

  return c.json({
    date: new Date().toISOString().slice(0, 10),
    counts: {
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      missingDocs: missingDocs.length,
      pendingMatches: data.pending.length,
      draftPayouts: data.payouts.length,
      expiringContracts: data.contracts.length,
      policyWarnings: data.policies.length,
    },
    charges: { overdue, dueSoon },
    missingDocs,
    pendingMatches: data.pending.map((p) => ({
      id: p.id,
      documentId: p.document_id,
      score: p.score,
      documentTitle: p.document_title,
    })),
    payouts: data.payouts.map((p) => ({
      id: p.id,
      propertyTitle: p.property_title,
      period: p.period,
      periodLabel: formatPeriodTr(p.period),
      netKurus: Number(p.net_kurus),
      net: formatTry(Number(p.net_kurus)),
    })),
    contracts: data.contracts.map((k) => ({
      id: k.id,
      propertyTitle: k.property_title,
      endDate: k.end_date,
      daysLeft: Number(k.days_left),
    })),
    policies: data.policies.map((p) => ({
      id: p.id,
      propertyTitle: p.property_title,
      district: p.district,
      kind: p.kind,
      endDate: p.end_date,
      daysLeft: Number(p.days_left),
    })),
    month: {
      period: monthPeriod,
      periodLabel: formatPeriodTr(monthPeriod),
      charged: formatTry(Number(data.month.charged)),
      collected: formatTry(Number(data.month.collected)),
      chargedKurus: Number(data.month.charged),
      collectedKurus: Number(data.month.collected),
    },
    modules: {
      owners: {
        total: data.modules.owners,
        portfolio: data.modules.listings_total,
      },
      properties: {
        total: data.modules.properties_total,
        occupied: data.modules.occupied,
        empty: Math.max(0, data.modules.properties_total - data.modules.occupied),
        sale: data.modules.sale,
        rent: data.modules.rent,
      },
      tenants: {
        active: data.modules.active_tenants,
        leaving: data.modules.expiring,
      },
      staff: {
        total: data.modules.staff,
        approvers: data.modules.approvers,
      },
      rent: {
        charged: formatTry(Number(data.month.charged)),
        collected: formatTry(Number(data.month.collected)),
        overdue: overdue.length,
        overdueKurus: overdue.reduce((sum, ch) => sum + ch.remainingKurus, 0),
        overdueFormatted: formatTry(overdue.reduce((sum, ch) => sum + ch.remainingKurus, 0)),
      },
      contracts: {
        active: data.modules.active_contracts,
        expiring: data.modules.expiring,
      },
      finance: {
        payoutPaid: formatTry(Number(data.modules.payout_paid)),
        payoutDraft: formatTry(Number(data.modules.payout_draft)),
        commission: formatTry(Number(data.modules.commission)),
      },
      /** TUR:29 — DASK/poliçe kutusu artık gerçek sayı gösterir. */
      dask: {
        total: Number(data.modules.policies_total ?? 0),
        warning: Number(data.modules.policies_warning ?? 0),
      },
      /** Henüz modülü olmayan kutular — arayüz "planlı" der, sıfır uydurmaz. */
      notBuilt: ["tasks", "messages"],
    },
  });
});

/**
 * API tipleri — para, sözleşme, tahakkuk, poliçe, rapor (K-1/K-2, TUR:50).
 * api-types.ts bunları yeniden dışa aktarır; `from "../api"` kullanımları değişmez.
 */

export type Session = {
  user: { id: string; name: string; email: string };
  tenant: { id: string; name: string };
  role: string;
  canApprove: boolean;
  mustChangePassword: boolean;
};

export type Summary = {
  activeListings: number;
  activeContracts: number;
  properties: number;
  openKurus: number;
  openFormatted: string;
  overdueCount: number;
  documents: number;
  pendingMatches: number;
};

export type Today = {
  date: string;
  counts: {
    overdue: number;
    dueSoon: number;
    missingDocs: number;
    pendingMatches: number;
    draftPayouts: number;
    expiringContracts: number;
    policyWarnings: number;
  };
  charges: {
    overdue: TodayCharge[];
    dueSoon: TodayCharge[];
  };
  missingDocs: Array<{ listingId: string; title: string; status: string; missing: string[] }>;
  pendingMatches: Array<{ id: string; documentId: string; score: number; documentTitle: string }>;
  payouts: Array<{
    id: string;
    propertyTitle: string;
    period: string;
    periodLabel: string;
    netKurus: number;
    net: string;
  }>;
  contracts: Array<{ id: string; propertyTitle: string; endDate: string; daysLeft: number }>;
  policies: Array<{
    id: string;
    propertyTitle: string;
    district: string | null;
    kind: string;
    endDate: string;
    daysLeft: number;
  }>;
  modules: {
    owners: { total: number; portfolio: number };
    properties: { total: number; occupied: number; empty: number; sale: number; rent: number };
    tenants: { active: number; leaving: number };
    staff: { total: number; approvers: number };
    rent: {
      charged: string;
      collected: string;
      overdue: number;
      overdueKurus: number;
      overdueFormatted: string;
    };
    contracts: { active: number; expiring: number };
    finance: { payoutPaid: string; payoutDraft: string; commission: string };
    dask: { total: number; warning: number };
    /** TUR:35 — arıza/bakım (açık talepler). */
    tasks: { open: number; urgent: number };
    notBuilt: string[];
  };
  month: {
    period: string;
    periodLabel: string;
    charged: string;
    collected: string;
    chargedKurus: number;
    collectedKurus: number;
  };
};

export type TodayCharge = {
  id: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyTitle: string;
  district: string | null;
  remainingKurus: number;
  remaining: string;
  dueDate: string;
  daysOverdue: number;
  daysLeft: number;
  noticeSentAt: string | null;
  level: "reminder" | "formal" | null;
};

/** TUR:29 — poliçe satırı. */

export type PolicyRow = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  district: string | null;
  kind: string;
  kindLabel: string;
  insurer: string | null;
  policyNo: string | null;
  startDate: string | null;
  endDate: string;
  premiumKurus: number | null;
  premiumText: string | null;
  note: string | null;
  daysLeft: number;
  expired: boolean;
  warning: boolean;
};

export type PolicyList = {
  count: number;
  items: PolicyRow[];
  kinds: Array<{ kind: string; label: string }>;
};

/** TUR:33 — adaya uygun portföy önerisi. */

export type ContractRow = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentKurus: number;
  rent: string;
  depositKurus: number;
  deposit: string;
  dueDay: number;
  utilityPayer: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyTitle: string;
  listingId: string;
};

export type ContractCharge = {
  id: string;
  period: string;
  kind: string;
  amountKurus: number;
  amount: string;
  dueDate: string;
  status: string;
  remindedAt: string | null;
  noticeSentAt: string | null;
  paidKurus: number;
  paid: string;
  remainingKurus: number;
  remaining: string;
  daysOverdue: number;
};

export type ContractSnapshot = {
  version: number;
  frozenAt: string;
  tenant: { fullName: string; phone: string | null; email: string | null };
  property: {
    title: string;
    city: string | null;
    district: string | null;
    address: string | null;
    roomCount: string | null;
  };
  owners: Array<{ fullName: string; shareBp: number | null }>;
  terms: {
    rentKurus: number;
    depositKurus: number;
    dueDay: number;
    utilityPayer: string;
    startDate: string;
    endDate: string | null;
  };
};

export type ContractDetail = {
  contract: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    rentKurus: number;
    rent: string;
    depositKurus: number;
    deposit: string;
    dueDay: number;
    utilityPayer: string;
    endReason: string | null;
    snapshot: ContractSnapshot | null;
  };
  tenant: { id: string; fullName: string; phone: string | null; email: string | null };
  property: { id: string; title: string; city: string | null; district: string | null };
  charges: ContractCharge[];
  totals: { charged: number; paid: number; open: number };
};

export type ChargeRow = {
  id: string;
  contractId: string;
  period: string;
  kind: string;
  amountKurus: number;
  amount: string;
  paidKurus: number;
  paid: string;
  remainingKurus: number;
  remaining: string;
  dueDate: string;
  status: string;
  remindedAt: string | null;
  noticeSentAt: string | null;
  daysOverdue: number;
  nextAction: "reminder" | "formal" | null;
  tenantName: string;
  tenantPhone: string | null;
  propertyTitle: string;
};

export type PayoutRow = {
  id: string;
  period: string;
  periodLabel: string;
  grossKurus: number;
  gross: string;
  feeKurus: number;
  fee: string;
  expenseKurus: number;
  expense: string;
  netKurus: number;
  net: string;
  status: "draft" | "paid";
  paidAt: string | null;
  note: string | null;
  contractId: string;
  propertyTitle: string;
  ownerName: string | null;
};

export type PayoutPreviewRow = {
  contractId: string;
  tenantName: string;
  ownerName: string;
  propertyTitle: string;
  rentKurus: number;
  rent: string;
  grossKurus: number;
  gross: string;
};

export type ImportResult = {
  dryRun: boolean;
  filename: string;
  totalRows: number;
  personsCreated: number;
  personsMerged: number;
  personsSkipped: number;
  propertiesCreated: number;
  listingsCreated: number;
  errors: Array<{ row: number; reason: string }>;
  mapping: Record<string, number>;
};

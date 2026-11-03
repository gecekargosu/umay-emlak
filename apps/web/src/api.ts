/**
 * API istemcisi.
 * Oturum httpOnly çerezde olduğu için credentials: "include" zorunlu;
 * token tarayıcıda saklanmaz (XSS ile çalınacak bir şey bırakmıyoruz).
 *
 * Para: sunucudan hem kuruş hem biçimlenmiş metin gelir. Arayüz kuruş
 * HESAPLAMAZ; metin girişini sunucu kuruşa çevirir (tek kaynak).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `İstek başarısız (${response.status})`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

/** Kuruş → "4.300.000,00" (yalnız gösterim; hesap sunucuda). */
export function kurusToText(kurus: number): string {
  return (kurus / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

export type ListingRow = {
  id: string;
  propertyId: string;
  kind: "sale" | "rent";
  status: string;
  priceKurus: number;
  price: string;
  title: string;
  district: string | null;
  city: string | null;
  publishedAt: string | null;
};

export type PersonRow = {
  id: string;
  kind: "owner" | "tenant" | "candidate";
  fullName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
};

export type DocumentRow = {
  id: string;
  kind: string;
  kindLabel: string;
  filename: string;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  personId: string | null;
  propertyId: string | null;
  listingId: string | null;
  personName: string | null;
  propertyTitle: string | null;
  verifiedAt: string | null;
  createdAt: string;
  pendingSuggestions: number;
};

export type DocumentSuggestion = {
  id: string;
  documentId: string;
  targetType: "person" | "property" | "listing";
  targetId: string;
  targetLabel: string;
  score: number;
  reasons: string[];
  status: "pending" | "approved" | "rejected";
};

export type DocumentDetail = {
  document: DocumentRow;
  suggestions: DocumentSuggestion[];
};

export type KindOption = { kind: string; label: string };

export type Requirement = { key: string; label: string; met: boolean };

export type ListingDetail = {
  listing: {
    id: string;
    propertyId: string;
    kind: "sale" | "rent";
    status: string;
    priceKurus: number;
    price: string;
    publishedAt: string | null;
  };
  property: {
    id: string;
    title: string;
    city: string | null;
    district: string | null;
    address: string | null;
    roomCount: string | null;
    grossM2: number | null;
    block: string | null;
    unitNo: string | null;
  };
  owners: Array<{ personId: string; fullName: string; phone: string | null; shareBp: number | null }>;
  documents: Array<{
    id: string;
    kind: string;
    kindLabel: string;
    filename: string;
    title: string | null;
    createdAt: string;
    personId: string | null;
    listingId: string | null;
  }>;
  requirements: Requirement[];
  missing: string[];
  priceHistory: Array<{
    id: string;
    oldKurus: number;
    newKurus: number;
    note: string | null;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    forced: boolean;
    note: string | null;
    createdAt: string;
  }>;
  canPublish: boolean;
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

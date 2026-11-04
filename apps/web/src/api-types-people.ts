/**
 * API tipleri — kişi, kiracı, personel, randevu (K-1/K-2, TUR:50).
 * api-types.ts bunları yeniden dışa aktarır; `from "../api"` kullanımları değişmez.
 */

export type TeamOffer = {
  id: string;
  bidderName: string;
  bidderPhone: string | null;
  amountKurus: number;
  amountText: string;
  status: string;
  note: string | null;
  createdAt: string;
};

export type TeamListing = {
  listingId: string;
  propertyId: string;
  kind: "sale" | "rent";
  status: string;
  priceKurus: number;
  priceText: string;
  title: string;
  address: string | null;
  district: string | null;
  city: string | null;
  roomCount: string | null;
  grossM2: number | null;
  floor: number | null;
  siteName: string | null;
  buildingName: string | null;
  unitNo: string | null;
  block: string | null;
  type: string;
  enteredAt: string;
  publishedAt: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  offers: TeamOffer[];
};

export type TeamAverage = {
  district: string;
  rentCount: number;
  saleCount: number;
  avgRentKurus: number;
  avgRentText: string;
  avgSaleKurus: number;
  avgSaleText: string;
};

export type TeamPortfolio = {
  member: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    role: string;
    status: string;
    canApprove: boolean;
  };
  listings: TeamListing[];
  averages: TeamAverage[];
};

export type TenantRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  contractId: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDay: number | null;
  rentKurus: number | null;
  rentText: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  district: string | null;
  city: string | null;
  address: string | null;
  unitNo: string | null;
  siteName: string | null;
  buildingName: string | null;
  ownerName: string | null;
  activeContracts: number;
  pastContracts: number;
  openKurus: number;
  openText: string;
  overdueCount: number;
  nextDueDate: string | null;
};

export type TenantCharge = {
  id: string;
  period: string;
  dueDate: string;
  status: string;
  amountKurus: number;
  amountText: string;
  paidKurus: number;
  paidText: string;
  overdue: boolean;
};

export type TenantContract = {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  rentKurus: number;
  rentText: string;
  depositKurus: number;
  depositText: string;
  depositRentCount: number | null;
  dueDay: number | null;
  utilityPayer: string | null;
  endReason: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  district: string | null;
  city: string | null;
  address: string | null;
  unitNo: string | null;
  siteName: string | null;
  buildingName: string | null;
  roomCount: string | null;
  grossM2: number | null;
  floor: number | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  paidKurus: number;
  paidText: string;
  openKurus: number;
  openText: string;
};

export type TenantDetail = {
  person: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    contactPermission: string | null;
    createdAt: string | null;
  };
  contracts: TenantContract[];
  charges: TenantCharge[];
  totals: {
    chargedKurus: number;
    chargedText: string;
    paidKurus: number;
    paidText: string;
    openKurus: number;
    openText: string;
  };
};

export type PersonRow = {
  id: string;
  kind: "owner" | "tenant" | "candidate";
  fullName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  candidateStage: string | null;
  followUpDate: string | null;
  budgetKurus: number | null;
  wantsDistrict: string | null;
  wantsRoomCount: string | null;
  contactPermission: "unknown" | "allowed" | "denied";
  contactPermissionAt: string | null;
};

export type PersonNote = { id: string; body: string; author: string; createdAt: string };

export type PersonSuggestion = {
  listingId: string;
  kind: string;
  title: string;
  district: string | null;
  city: string | null;
  roomCount: string | null;
  grossM2: number | null;
  priceKurus: number;
  priceText: string;
  score: number;
  reasons: string[];
};

/** TUR:31 — randevu / yer gösterme. */

export type Appointment = {
  id: string;
  personId: string;
  personName: string;
  personPhone: string | null;
  personStage: string | null;
  listingId: string | null;
  propertyTitle: string | null;
  district: string | null;
  staffName: string | null;
  scheduledAt: string;
  date: string;
  time: string;
  dateText: string;
  durationMin: number;
  place: string | null;
  status: string;
  statusLabel: string;
  resultNote: string | null;
  offerId: string | null;
};

/**
 * API tipleri — ilan, mal sahibi, portföy (K-1/K-2, TUR:50).
 * api-types.ts bunları yeniden dışa aktarır; `from "../api"` kullanımları değişmez.
 */

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
  address: string | null;
  roomCount: string | null;
  block: string | null;
  unitNo: string | null;
  floor: number | null;
  siteName: string | null;
  buildingName: string | null;
  ownerName: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  authorityNo?: string | null;
  publishedAt: string | null;
};

export type OwnerRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  propertyCount: number;
  saleCount: number;
  rentCount: number;
  contractCount: number;
  saleKurus: number;
  saleText: string;
  rentKurus: number;
  rentText: string;
  monthlyRentKurus: number;
  monthlyRentText: string;
  openKurus: number;
  openText: string;
};

export type OwnerProperty = {
  id: string;
  title: string;
  type: string;
  city: string | null;
  district: string | null;
  address: string | null;
  roomCount: string | null;
  grossM2: number | null;
  siteName: string | null;
  buildingName: string | null;
  unitNo: string | null;
  block: string | null;
  listingId: string | null;
  kind: string | null;
  status: string | null;
  priceKurus: number;
  priceText: string | null;
  authorityNo: string | null;
  contractId: string | null;
  rentKurus: number | null;
  rentText: string | null;
  dueDay: number | null;
  startDate: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  openKurus: number;
  openText: string;
  documentCount: number;
};

export type OwnerDetail = {
  person: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    createdAt: string | null;
    propertyCount: number;
    portfolioKurus: number;
    portfolioText: string;
    monthlyRentKurus: number;
    monthlyRentText: string;
    openKurus: number;
    openText: string;
  };
  properties: OwnerProperty[];
};

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
    authorityNo: string | null;
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
    floor: number | null;
    siteName: string | null;
    buildingName: string | null;
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

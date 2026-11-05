/**
 * API tipleri — belge, medya, içe aktarma (K-1/K-2, TUR:50).
 * api-types.ts bunları yeniden dışa aktarır; `from "../api"` kullanımları değişmez.
 */

export type PropertyAssets = {
  property: { id: string; title: string };
  subscriptions: Array<{
    id: string;
    kind: string;
    provider: string | null;
    subscriberNo: string | null;
    monthly: string | null;
    note: string | null;
  }>;
  fixtures: Array<{ id: string; name: string; quantity: number; note: string | null }>;
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

/** İnceleme kuyruğu satırı — belge + aday hedef tek satırda (K-93). */
export type DocumentQueueItem = {
  id: string;
  documentId: string;
  targetType: "person" | "property" | "listing";
  targetLabel: string;
  score: number;
  reasons: string[];
  createdAt: string;
  filename: string;
  title: string | null;
  kindLabel: string;
};

export type DocumentQueue = { count: number; items: DocumentQueueItem[] };

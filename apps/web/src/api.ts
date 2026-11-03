/**
 * API istemcisi.
 * Oturum httpOnly çerezde olduğu için credentials: "include" zorunlu;
 * token tarayıcıda saklanmaz (XSS ile çalınacak bir şey bırakmıyoruz).
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
};

export type ListingRow = {
  id: string;
  kind: "sale" | "rent";
  status: string;
  priceKurus: number;
  price: string;
  title: string;
  district: string | null;
  city: string | null;
};

export type PersonRow = {
  id: string;
  kind: "owner" | "tenant" | "candidate";
  fullName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
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

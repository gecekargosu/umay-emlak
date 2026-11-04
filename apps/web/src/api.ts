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

/**
 * K-9: kullanıcıya sade Türkçe cümle + kayıt numarası; teknik ayrıntı konsola.
 * Sunucudan gelen mesaj zaten kullanıcı dilindedir (HttpError), o olduğu gibi gösterilir.
 */
export function userError(caught: unknown, fallback: string): string {
  if (caught instanceof ApiError) return caught.message;
  const ref = `K-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  console.error(`[UMAY] ${ref} ${fallback}`, caught);
  return `${fallback} (kayıt no: ${ref})`;
}

/** Yalnız log'a yazılır: ekranı boşa düşürmeyecek yardımcı çağrılar için. */
export function logOnly(caught: unknown, what: string): void {
  const ref = `K-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  console.error(`[UMAY] ${ref} ${what}`, caught);
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
      (data as { error?: string } | null)?.error ?? `İstek başarısız (kayıt no: HTTP-${response.status})`;
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

export * from "./api-types";

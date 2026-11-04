import { useEffect, useState } from "react";

/**
 * Y-57: uzun formlarda yarım iş kaybolmasın.
 * Değer localStorage'a yazılır; sayfa kapanıp açıldığında kaldığı yerden devam eder.
 * Kiracı/para gibi hassas veri tutulmaz — yalnız form taslağı (tarayıcıda, kullanıcı makinesinde).
 */
export function useDraft<T extends Record<string, unknown>>(
  key: string,
  initial: T,
): readonly [T, (value: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initial;
      return { ...initial, ...(JSON.parse(raw) as Partial<T>) };
    } catch (caught) {
      // Bozuk taslak formu kilitlemesin; sebep kaybolmasın.
      console.warn(`[UMAY] ${key} taslağı okunamadı`, caught);
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (caught) {
      // Kota dolu veya depolama kapalı: taslak yazılamazsa form çalışmaya devam eder.
      console.warn(`[UMAY] ${key} taslağı yazılamadı`, caught);
    }
  }, [key, value]);

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch (caught) {
      console.warn(`[UMAY] ${key} taslağı silinemedi`, caught);
    }
    setValue(initial);
  }

  return [value, setValue, clear] as const;
}

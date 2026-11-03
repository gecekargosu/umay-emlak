/**
 * Test ayarları.
 *
 * Neden sıralı: testler aynı tohum hesaplarını kullanıyor ve auth testleri
 * bilerek şifre değiştiriyor. Dosyalar paralel koşunca biri diğerinin
 * şifresini değiştirmiş oluyor (yanlış 401). Sıralı koşu bunu bitirir.
 *
 * LOGIN_RATE_LIMIT: giriş hız sınırı üretimde 15 dakikada 10; testte onlarca
 * giriş yapıldığı için yükseltilir. Korumayı testte kapatmıyoruz, sadece
 * eşiği gerçekçi olmayan bir sayıya çekmiyoruz.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      LOGIN_RATE_LIMIT: "1000",
    },
    testTimeout: 20_000,
  },
});

/**
 * Para ayrıştırma testleri — K-13.
 * Aysan fiyatı "4.300.000" diye yazar; bu binlik ayırıcıdır, 4,3 TL değildir.
 * Ayrıştırıcı bu yüzden Türk yazımını kabul etmek zorunda.
 */
import { describe, expect, it } from "vitest";
import { formatKurus, formatTry, parseTryToKurus, percentOfKurus } from "../src/money.js";

describe("parseTryToKurus", () => {
  it("Türk binlik ve ondalık yazımını okur", () => {
    expect(parseTryToKurus("4.300.000")).toBe(430_000_000);
    expect(parseTryToKurus("1.850.000,50")).toBe(185_000_050);
    expect(parseTryToKurus("12.500")).toBe(1_250_000);
    expect(parseTryToKurus("12500")).toBe(1_250_000);
    expect(parseTryToKurus("12500,5")).toBe(1_250_050);
    expect(parseTryToKurus("12500.5")).toBe(1_250_050);
    expect(parseTryToKurus("0,99")).toBe(99);
  });

  it("anlamsız girdiyi reddeder", () => {
    expect(() => parseTryToKurus("")).toThrow();
    expect(() => parseTryToKurus("dört bin")).toThrow();
    expect(() => parseTryToKurus("4.30.00")).toThrow();
    expect(() => parseTryToKurus("1,234.56")).toThrow();
  });
});

describe("biçimleme ve oran", () => {
  it("kuruşu Türk Lirası olarak yazar", () => {
    expect(formatKurus(430_000_000)).toBe("4.300.000,00");
    expect(formatTry(185_000_050)).toBe("1.850.000,50 ₺");
  });

  it("yüzde hesabını kayan noktasız yapar", () => {
    expect(percentOfKurus(430_000_000, 300)).toBe(12_900_000); // %3
    expect(percentOfKurus(1_000_000, 250)).toBe(25_000); // %2,5
  });
});

/** İlan türü/durum etiketleri — tek yerde (K-1/K-2, TUR:49). */
export const KIND_TR: Record<string, string> = { sale: "Satılık", rent: "Kiralık" };
export const STATUS_TR: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  reserved: "Kaporalı",
  closed: "Kapandı",
  archived: "Arşiv",
};

/** İzin verilen geçişler sunucudaki kuralla aynı; sunucu yine kendi kontrolünü yapar. */
const NEXT_STATUS: Record<string, Array<{ status: string; label: string }>> = {
  draft: [
    { status: "active", label: "Yayına al" },
    { status: "archived", label: "Arşivle" },
  ],
  active: [
    { status: "reserved", label: "Kaporalı" },
    { status: "closed", label: "Kapat" },
    { status: "archived", label: "Arşivle" },
  ],
  reserved: [
    { status: "active", label: "Kapora geri alındı" },
    { status: "closed", label: "Kapat" },
  ],
  closed: [{ status: "archived", label: "Arşivle" }],
  archived: [],
};

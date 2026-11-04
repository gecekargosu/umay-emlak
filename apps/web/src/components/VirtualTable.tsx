import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Sanal tablo — TUR:54 (K-10, yol haritası 1. madde).
 *
 * Sorun: 500+ kayıtta tüm satırları basmak tarayıcıyı yavaşlatıyordu; önceki çözüm
 * "ilk 60 / sonraki 60" idi, yani kullanıcı yine parça parça geziniyordu.
 *
 * Çözüm: kaydırma kutusu sabit yükseklikte; yalnız GÖRÜNEN satırlar basılır.
 * Görünmeyen satırların yerine tek bir dolgu satırı konur, böylece kaydırma çubuğu
 * gerçek uzunluğu gösterir. Ek paket yok (AGENTS.md: yeni bağımlılık yok).
 *
 * Koşul: satır yüksekliği sabit olmalı (rowHeight). Uzun hücreler tek satırda
 * kesilir; bu yüzden tabloya `virtual-table` sınıfı eklenir ve CSS'te nowrap uygular.
 */
export function VirtualTable<T>({
  rows,
  head,
  columns,
  renderRow,
  rowHeight = 38,
  overscan = 8,
  height = "58vh",
}: {
  rows: T[];
  /** <thead> içine girecek <tr>. */
  head: ReactNode;
  /** Dolgu satırının colspan'ı = sütun sayısı. */
  columns: number;
  /** Her kayıt için <tr> döndürür (key vermek çağıranın işi). */
  renderRow: (row: T, index: number) => ReactNode;
  rowHeight?: number;
  overscan?: number;
  height?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => setScrollTop(box.scrollTop);
    const measure = () => setViewport(box.clientHeight || 600);
    box.addEventListener("scroll", onScroll, { passive: true });
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(box);
    return () => {
      box.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(rows.length, start + visibleCount);
  const topPad = start * rowHeight;
  const bottomPad = Math.max(0, (rows.length - end) * rowHeight);

  return (
    <>
      <div className="table-scroll virtual-scroll" ref={boxRef} style={{ maxHeight: height }}>
        <table className="virtual-table">
          <thead>{head}</thead>
          <tbody>
            {topPad > 0 && (
              <tr aria-hidden="true" className="virtual-pad">
                <td colSpan={columns} style={{ height: topPad, padding: 0, border: 0 }} />
              </tr>
            )}
            {rows.slice(start, end).map((row, index) => renderRow(row, start + index))}
            {bottomPad > 0 && (
              <tr aria-hidden="true" className="virtual-pad">
                <td colSpan={columns} style={{ height: bottomPad, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {rows.length} kayıt · ekranda {rows.length === 0 ? 0 : end - start} satır basılıyor
        (kaydırdıkça yenilenir; kayıtların hepsi listede).
      </p>
    </>
  );
}

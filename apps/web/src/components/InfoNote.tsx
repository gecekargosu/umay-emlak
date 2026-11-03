/**
 * Bilgi notu — "bu ekran ne yapar, neye dikkat edilir".
 *
 * Kaynak dosya 6.10: boş durum, hata, yetki mesajları kullanıcıyı yönlendirmeli.
 * Aynı mantıkla her ekranın üstünde kısa bir açıklama durur; personel
 * "burada neye bakıyorum" sorusunu sormak zorunda kalmaz.
 */
export function InfoNote({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="info-note" role="note">
      <span className="badge-i">i</span>
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

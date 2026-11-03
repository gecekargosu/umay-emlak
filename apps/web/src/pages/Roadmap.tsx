import { InfoNote } from "../components/InfoNote";

/**
 * Yol haritası — TUR:25.
 * Kullanıcı isteği: "bilgi bankamızı yeniden oku, her özellik bizim programda var mı
 * listele, olanları ve olmayanları yaz, olmayanlar için görev sırası hazırla."
 *
 * Tek kaynak: kökteki "umay emlak program detayları benim yazdığım.txt".
 * Durumlar: var / kismi / yok. Sıra numarası olanlar sıradaki işlerdir.
 */
type Status = "var" | "kismi" | "yok";

type Row = {
  key: string;
  title: string;
  status: Status;
  note: string;
  /** Olmayanlar için önerilen sıra (1 = ilk yapılacak) */
  order?: number;
};

const ROWS: Row[] = [
  { key: "ofis", title: "Ofis, ortaklar, personel, yetki sınırları", status: "var", note: "Rol + canApprove; personel kendi portföyünü görür." },
  { key: "miras", title: "Mal sahipleri: mülk, kiracı, borç klasörü", status: "var", note: "Mal sahipleri ekranı + kişi dosyası." },
  { key: "raf", title: "Raf görünümü (vitrin) ve liste görünümü", status: "var", note: "Işıldayan raf, kartta fiyat/durum; liste + filtre birlikte." },
  { key: "filtre", title: "Adres, daire, site, sahip, kiracı, ilçe, oda, fiyat filtreleri", status: "var", note: "Yazarken kendiliğinden süzülür." },
  { key: "sozlesme", title: "Sözleşme kaydı ve yazdırılabilir sözleşme metni", status: "var", note: "Snapshot dondurma + A4 metin." },
  { key: "kira", title: "Kira tahakkuku, tahsilat, gecikme takibi", status: "var", note: "Kiralar/tahsilat ekranı, gecikme seviyesi, ihtarname adayı." },
  { key: "belge", title: "Belge arşivi (sha256) + eşleştirme", status: "var", note: "Net ada göre otomatik bağ, belirsizde onay." },
  { key: "fiyat", title: "Fiyat geçmişi (eski fiyat silinmez)", status: "var", note: "listing_price_change tablosu." },
  { key: "personel", title: "Personel portföyü + alınan teklifler", status: "var", note: "İlçe ortalaması ve mülk dosyasıyla." },
  { key: "teklif", title: "Müşteri teklifi / görüşme kaydı", status: "var", note: "İlan altında tutar + not + durum." },
  { key: "kvkk", title: "KVKK iletişim izni", status: "var", note: "İzin bilinmiyor / var / yok + not." },
  { key: "mukerrer", title: "Mükerrer kişi birleştirme (silmeden)", status: "var", note: "Kaybeden kayıt arşivde kalır." },
  { key: "aktar", title: "Excel/CSV içe aktarma", status: "var", note: "İçe aktar ekranı, mükerrer açmaz." },
  { key: "guvenlik", title: "Oturum, şifre değiştirme, boşta kilit", status: "var", note: "Zorunlu şifre + IdleLock." },
  { key: "arama", title: "Genel arama (/) ve bildirim sayacı", status: "var", note: "Üst bar." },

  { key: "komisyon", title: "Satış/kiralama komisyonu (%3) ve kapora makbuzu", status: "yok", note: "Satılıklar ekranında olacak; kapora alınınca ilan kaporalıya düşer.", order: 1 },
  { key: "tutanak", title: "Teslim tutanağı + demirbaş listesi (fotoğraflı)", status: "kismi", note: "Demirbaş/abonelik kaydı var, tutanak belgesi ve imza akışı yok.", order: 2 },
  { key: "dask", title: "DASK / poliçe bitiş takibi", status: "yok", note: "Ana sayfada 'planlı' duruyor.", order: 3 },
  { key: "artis", title: "TÜİK kira artış oranıyla yenileme hesabı", status: "yok", note: "Oran kaynağı ve tarihi gösterilmeli; otomatik uygulanmamalı.", order: 4 },
  { key: "randevu", title: "Randevu / yer gösterme modülü", status: "yok", note: "Aday + portföy + personel + sonuç.", order: 5 },
  { key: "eslesme", title: "Alıcı adayına uygun portföy önerisi", status: "yok", note: "Bütçe + ilçe + oda eşleşmesi; aday CRM alanları hazır.", order: 6 },
  { key: "talep", title: "Arıza / bakım talebi (kiracıdan)", status: "yok", note: "Görev modülüyle birlikte gelmeli.", order: 7 },
  { key: "hatirlat", title: "Otomatik hatırlatıcı (SMS/e-posta/push)", status: "yok", note: "Kira günü, sözleşme bitişi, DASK; izin kurallarıyla.", order: 8 },
  { key: "ekstre", title: "Gider ve mal sahibi hesap ekstresi", status: "kismi", note: "Aktarım (payout) var; gider kalemi ve yazdırılabilir ekstre yok.", order: 9 },
  { key: "audit", title: "İşlem ve değişiklik geçmişi (kim ne yaptı)", status: "kismi", note: "Belge onayı ve fiyat geçmişi var; genel denetim kaydı yok.", order: 10 },
  { key: "foto", title: "Fotoğraf/video + filigranlı kopya", status: "yok", note: "Kart üzerinde baş harfler var, kapak fotoğrafı yok.", order: 11 },
  { key: "rapor", title: "Personel performansı ve ofis raporları", status: "kismi", note: "Portföy/teklif sayıları var; dönemsel rapor ekranı yok.", order: 12 },
  { key: "malSahibiPanel", title: "Mal sahibi paneli (şeffaflık)", status: "yok", note: "Ayrı giriş ve yalnız kendi verisi.", order: 13 },
  { key: "kiraciPanel", title: "Kiracı paneli (sözleşme, ödeme, dekont)", status: "yok", note: "Sanal POS/ödeme kuruluşu kararı gerekiyor.", order: 14 },
  { key: "mobil", title: "Mobil uygulama (saha)", status: "yok", note: "Aynı API üzerinden; Tauri/React Native kararı sonra.", order: 15 },
  { key: "whatsapp", title: "WhatsApp / e-posta entegrasyonu", status: "yok", note: "Toplu bildirimle birlikte tasarlanmalı.", order: 16 },
];

const SUGGESTIONS: Array<{ title: string; body: string }> = [
  {
    title: "1) Komisyon ve kapora aynı ekranda olsun",
    body: "Satışta %3 varsayılan ama oran/tutar elle değişebilsin, indirim gerekçesi zorunlu olsun. Kapora alınınca ilan kendiliğinden 'kaporalı'ya düşsün; kapora iadesi de kayda geçsin. Bu, ofisin en çok para kaybettiği yer: sözlü anlaşma.",
  },
  {
    title: "2) Teslim tutanağı: fotoğraf + demirbaş + imza",
    body: "Kiracı girerken ve çıkarken aynı ekrandan tutanak üretilsin; fotoğraflar mülke bağlansın. Depozito iadesi tartışması bu belgeyle biter.",
  },
  {
    title: "3) DASK/poliçe takibi küçük ama kritik",
    body: "Poliçe bitiş tarihi + 30 gün önce hatırlatma. Ana sayfada 'planlı' yerine gerçek sayı görünür.",
  },
  {
    title: "4) Teklif kabulünde zincir kurulsun",
    body: "Teklif kabul edilince ilan 'kaporalı'ya düşsün, komisyon taslağı oluşsun, kabul eden müşteri alıcı adayına dönsün. Şu an üç ayrı yerde elle yapılıyor.",
  },
  {
    title: "5) Her ekranda geri + tek tuşla ana sayfa",
    body: "Aysan 18 personelle çalışacak; yanlış ekrana giren personelin geri dönememesi en çok şikâyet edilen şey olur. Artık üst bar + detay geri tuşları var, yeni ekranlarda da korunmalı.",
  },
  {
    title: "6) Para biriminde tek kural",
    body: "Her tutar kuruş (tam sayı) olarak saklanıyor, ekranda biçimleniyor. Yeni modüllerde de bu kural bozulmasın; ondalıkla hesap yapılmasın.",
  },
  {
    title: "7) Sessiz hatalar yerine açık uyarı",
    body: "Belge eşleşmezse kişi açtık; bu iyi. Ama kullanıcıya 'ne oldu' tek satırda söylenmeli. Aksi hâlde 3 ay sonra 200 sahte kişi kaydı olur.",
  },
  {
    title: "8) Yedek her turda",
    body: "Kod her turda zip olarak kaynaklar/yedek altına alınıyor; PostgreSQL dökümü de (pg_dump) aynı yere eklenmeli. Kod gider, veri kalır.",
  },
];

const STATUS_TR: Record<Status, string> = {
  var: "VAR",
  kismi: "KISMİ",
  yok: "YOK",
};

export function Roadmap() {
  const counts = {
    var: ROWS.filter((r) => r.status === "var").length,
    kismi: ROWS.filter((r) => r.status === "kismi").length,
    yok: ROWS.filter((r) => r.status === "yok").length,
  };
  const planned = ROWS.filter((r) => r.order !== undefined).sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99),
  );

  return (
    <div>
      <div className="page-head">
        <h2>Yol haritası</h2>
        <span className="spacer" />
        <span className="muted small">
          {counts.var} var · {counts.kismi} kısmi · {counts.yok} yok
        </span>
      </div>

      <InfoNote title="Bilgi bankası yeniden okundu, programla karşılaştırıldı.">
        Kaynak: kökteki <strong>“umay emlak program detayları benim yazdığım.txt”</strong>. Aşağıdaki
        liste o dosyadaki her başlığın bugünkü programda karşılığı olup olmadığını gösterir.
        <strong> YOK</strong> ve <strong>KISMİ</strong> olanlar numaralı sıraya dizildi; numara küçükse
        önce o yapılır. Sıra, “para kaybettiren / hukuki risk taşıyan” iş önce olacak şekilde kuruldu.
      </InfoNote>

      <h3>Olanlar</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Özellik</th>
              <th>Durum</th>
              <th>Programdaki karşılığı</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((r) => r.status === "var").map((row) => (
              <tr key={row.key}>
                <td>{row.title}</td>
                <td>
                  <span className="chip ok">{STATUS_TR[row.status]}</span>
                </td>
                <td className="muted small">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 22 }}>Eksikler ve görev sırası</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Sıra</th>
              <th>Özellik</th>
              <th>Durum</th>
              <th>Neden / not</th>
            </tr>
          </thead>
          <tbody>
            {planned.map((row) => (
              <tr key={row.key}>
                <td>{row.order}</td>
                <td>{row.title}</td>
                <td>
                  <span className={`chip ${row.status === "yok" ? "danger" : ""}`}>
                    {STATUS_TR[row.status]}
                  </span>
                </td>
                <td className="muted small">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 22 }}>Benim önerilerim</h3>
      <ul className="doc-list">
        {SUGGESTIONS.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <div className="muted small">{item.body}</div>
          </li>
        ))}
      </ul>

      <p className="hint">
        Bu liste kayıtlara da yazıldı: <strong>09-BILGI-BANKASI-KARSILASTIRMA.txt</strong>. Bir madde
        yapıldığında orada “YAPILDI” işaretlenir, satır silinmez.
      </p>
    </div>
  );
}

import { InfoNote } from "../components/InfoNote";

/**
 * Yol haritası — TUR:25, güncellendi TUR:47.
 * Kullanıcı isteği: "bilgi bankamızı yeniden oku, her özellik bizim programda var mı
 * listele, olanları ve olmayanları yaz, olmayanlar için görev sırası hazırla."
 * İkinci istek (TUR:47): "bu liste hiç değişmiyor — yapılanları çıkart, yapılacakları ekle."
 *
 * Tek kaynak: kökteki "umay emlak program detayları benim yazdığım.txt".
 * Kural: bir madde bitince satır SİLİNMEZ; "var" durumuna geçer ve KAPANANLAR
 * bölümüne taşınır. Sıra numarası elle yazılmaz — açık maddeler sırayla 1..N
 * numaralanır, böylece bir madde kapanınca numaralar kendiliğinden kayar.
 */
type Status = "var" | "kismi" | "yok";

type Row = {
  key: string;
  title: string;
  status: Status;
  note: string;
  /** Hangi turda ele alındı (ekranda "son dokunulan" işareti için) */
  turn?: string;
};

type Closed = { title: string; turn: string; what: string };

/** Programda karşılığı olanlar. */
const ROWS_VAR: Row[] = [
  { key: "ofis", title: "Ofis, ortaklar, personel, yetki sınırları", status: "var", note: "Rol + canApprove; personel kendi portföyünü görür." },
  { key: "miras", title: "Mal sahipleri: mülk, kiracı, borç klasörü", status: "var", note: "Mal sahipleri ekranı + kişi dosyası." },
  { key: "raf", title: "Raf görünümü (vitrin) ve liste görünümü", status: "var", note: "Işıldayan raf, kartta fiyat/durum; liste + filtre birlikte." },
  { key: "filtre", title: "Adres, daire, site, sahip, kiracı, ilçe, oda, fiyat filtreleri", status: "var", note: "Yazarken kendiliğinden süzülür." },
  { key: "sozlesme", title: "Sözleşme kaydı ve yazdırılabilir sözleşme metni", status: "var", note: "Snapshot dondurma + A4 metin." },
  { key: "kira", title: "Kira tahakkuku, tahsilat, gecikme takibi", status: "var", note: "Kiralar/tahsilat ekranı, gecikme seviyesi, ihtarname adayı." },
  { key: "belge", title: "Belge arşivi (sha256) + eşleştirme", status: "var", note: "Net ada göre otomatik bağ, belirsizde onay." },
  { key: "belgeAra", title: "Belgelerde arama ve liste önde", status: "var", note: "Yazarken süzülür; yükleme formu katlanır panelde (H-15, TUR:47).", turn: "TUR:47" },
  { key: "fiyat", title: "Fiyat geçmişi (eski fiyat silinmez)", status: "var", note: "listing_price_change tablosu." },
  { key: "personel", title: "Personel portföyü + alınan teklifler", status: "var", note: "İlçe ortalaması ve mülk dosyasıyla." },
  { key: "teklif", title: "Müşteri teklifi / görüşme kaydı", status: "var", note: "İlan altında tutar + not + durum." },
  { key: "komisyon", title: "Satış/kiralama komisyonu (%3) ve kapora makbuzu", status: "var", note: "Taslak → onay → ödendi; indirimde gerekçe zorunlu, kapora alınınca ilan kaporalıya düşer.", turn: "TUR:25" },
  { key: "dask", title: "DASK / poliçe bitiş takibi", status: "var", note: "Poliçeler ekranı bitiş tarihini tutar; otomatik hatırlatma yok (aşağıda 5. madde).", turn: "TUR:42" },
  { key: "randevu", title: "Randevu / yer gösterme modülü", status: "var", note: "Randevu ekranı + takvim; aday, portföy, personel, sonuç.", turn: "TUR:24" },
  { key: "kvkk", title: "KVKK iletişim izni", status: "var", note: "İzin bilinmiyor / var / yok + not." },
  { key: "mukerrer", title: "Mükerrer kişi birleştirme (silmeden)", status: "var", note: "Kaybeden kayıt arşivde kalır." },
  { key: "aktar", title: "Excel/CSV içe aktarma", status: "var", note: "İçe aktar ekranı, mükerrer açmaz." },
  { key: "guvenlik", title: "Oturum, şifre değiştirme, boşta kilit", status: "var", note: "Zorunlu şifre + IdleLock." },
  { key: "arama", title: "Genel arama (/) ve bildirim sayacı", status: "var", note: "Üst bar." },
  { key: "gorev", title: "Görev listesi (arıza, bakım, hatırlatma)", status: "var", note: "Operasyon → Görevler; kiracı kendi talebini giremez (aşağıda 4. madde).", turn: "TUR:44" },
  { key: "hata", title: "Anlaşılır hata mesajı + kayıt numarası", status: "var", note: "500'de \"Bu numarayla bildirin: R-…\"; aynı numara sunucu log'unda.", turn: "TUR:45" },
  { key: "denetim", title: "İşlem kaydı altyapısı (audit_log)", status: "var", note: "Her yazma isteği kim/ofis/uç/kayıt ile saklanıyor; ekranı yok (aşağıda 7. madde).", turn: "TUR:46" },
  { key: "uzunListe", title: "Portföy listesi 500 kayıtta akıcı", status: "var", note: "Liste 100'lük parçalarla açılıyor (K-10, TUR:47). Tam sanal liste değil.", turn: "TUR:47" },
];

/** Henüz olmayan / yarım olanlar. Sıra numarası bu dizinin sırasıdır. */
const ROWS_OPEN: Row[] = [
  {
    key: "artis",
    title: "TÜİK kira artış oranıyla yenileme hesabı",
    status: "yok",
    note: "Oran kaynağı ve tarihi gösterilmeli; otomatik uygulanmamalı (K-72: oran veridir).",
  },
  {
    key: "eslesme",
    title: "Alıcı adayına uygun portföy önerisi",
    status: "yok",
    note: "Bütçe + ilçe + oda eşleşmesi; aday CRM alanları hazır.",
  },
  {
    key: "talep",
    title: "Kiracıdan arıza/talep girişi (kiracı kendi açsın)",
    status: "kismi",
    note: "Görev kaydı ofis içinde açılıyor; kiracının kendi talebini gireceği ekran/izin yok.",
  },
  {
    key: "hatirlat",
    title: "Otomatik hatırlatıcı (SMS/e-posta/push)",
    status: "yok",
    note: "Kira günü, sözleşme bitişi, poliçe bitişi. İzin (KVKK) ve sağlayıcı kararıyla birlikte.",
  },
  {
    key: "ekstre",
    title: "Gider kalemi ve mal sahibi hesap ekstresi",
    status: "kismi",
    note: "Aktarım (payout) var; gider kalemi ve yazdırılabilir ekstre yok.",
  },
  {
    key: "denetimEkran",
    title: "Denetim kaydı ekranı (kim ne yaptı, ne zaman)",
    status: "kismi",
    note: "Kayıt API'den okunuyor (GET /api/v1/audit); personele gösteren ekran ve personel devri geçmişi yok.",
  },
  {
    key: "foto",
    title: "Fotoğraf/video + filigranlı kopya",
    status: "kismi",
    note: "Mülk dosyasında belge yükleme var; kapak fotoğrafı, galeri ve filigran yok.",
  },
  {
    key: "rapor",
    title: "Personel performansı ve ofis raporları (dönemsel)",
    status: "kismi",
    note: "Portföy/teklif sayıları var; tarih aralığı seçilen rapor ekranı yok.",
  },
  {
    key: "malSahibiPanel",
    title: "Mal sahibi paneli (şeffaflık)",
    status: "yok",
    note: "Ayrı giriş ve yalnız kendi verisi; yetki modeliyle birlikte tasarlanmalı.",
  },
  {
    key: "kiraciPanel",
    title: "Kiracı paneli (sözleşme, ödeme, dekont)",
    status: "yok",
    note: "Sanal POS/ödeme kuruluşu kararı gerekiyor (K-70…K-83: dış servis kararı önce).",
  },
  {
    key: "mobil",
    title: "Mobil uygulama (saha)",
    status: "yok",
    note: "Aynı API üzerinden; teknoloji kararı sonra.",
  },
  {
    key: "whatsapp",
    title: "WhatsApp / e-posta entegrasyonu",
    status: "yok",
    note: "Toplu bildirimle birlikte tasarlanmalı.",
  },
];

/** Son turlarda kapanan maddeler — satır silinmez, buraya taşınır. */
const CLOSED: Closed[] = [
  { title: "Komisyon (%3) + kapora makbuzu", turn: "TUR:25", what: "Komisyon taslağı, indirim gerekçesi, kapora al/iade; kapora alınınca ilan kaporalıya düşüyor." },
  { title: "Randevu / yer gösterme", turn: "TUR:24", what: "Randevu ekranı + takvim; aday, portföy, personel ve sonuç birlikte." },
  { title: "DASK / poliçe listesi", turn: "TUR:42", what: "Poliçeler ekranı bitiş tarihiyle listeleniyor (H-13/H-14: liste + mülk arama)." },
  { title: "Görevler ekranı + kira satırı etiketi", turn: "TUR:44", what: "Operasyon → Görevler; kira satırında etiket (H-7/H-8)." },
  { title: "Anlaşılır hata + kayıt numarası", turn: "TUR:45", what: "Kullanıcı 'R-…' numarası görüyor; sunucuda aynı numarayla tek satır log." },
  { title: "Denetim kaydı altyapısı (audit_log)", turn: "TUR:46", what: "Her yazma isteği ofis/kullanıcı/uç/kayıt ile saklanıyor; x-request-id + JSON log." },
  { title: "Belgelerde arama önde, yükleme katlanır", turn: "TUR:47", what: "Yazarken süzülür, liste üstte; yükleme formu tıklayınca açılır (H-15)." },
  { title: "Portföy listesi parçalı gösterim", turn: "TUR:47", what: "İlk 100 kayıt + 'sonraki 100'; 500 kayıtta DOM şişmiyor (K-10)." },
  { title: "Teslim tutanağı PDF (fotoğraf + imza alanı)", turn: "TUR:52", what: "Kayıtlı tutanaktan A4 PDF: taşınmaz, taraflar, demirbaş, depozito hesabı, mülkün 3 fotoğrafı ve imza alanları; mülk dosyasından açılıyor." },
];

const SUGGESTIONS: Array<{ title: string; body: string }> = [
  {
    title: "1) Denetim kaydını ekrana çıkar",
    body: "Altyapı hazır (audit_log + x-request-id). Kalan iş \"Son işlemler\" ekranı: kim, ne, ne zaman, hangi kayıt. 18 personelle çalışırken 'bunu kim değiştirdi' sorusu bu ekranla biter.",
  },
  {
    title: "2) Portföy listesinde tam sanal liste",
    body: "Şimdi 100'lük parçalarla açılıyor; kayıt 2000'i geçince yine yavaşlar. Görünmeyen satırları hiç basmayan sanal liste (kendi bileşenimiz, ek paket yok) sıradaki adım olmalı.",
  },
  {
    title: "3) Kiracı talebini kiracı açsın",
    body: "Görev kaydı var ama kapı kiracıya kapalı. Kiracı paneli kurulana kadar en azından tek kullanımlık talep bağlantısı (token) ile arıza bildirimi alınabilir; telefonda kaybolan arızalar kayda girer.",
  },
  {
    title: "4) Poliçe ve sözleşme bitişinde tek uyarı listesi",
    body: "Poliçeler ve sözleşmeler tarihleri tutuyor ama kimseye seslenmiyor. Otomatik SMS/e-posta kararı verilene kadar ana sayfada 'bu ay bitecekler' tek listesi olsun; para kaybettiren yer burası.",
  },
  {
    title: "5) Her ekranda geri + tek tuşla ana sayfa",
    body: "Aysan 18 personelle çalışacak; yanlış ekrana giren personelin geri dönememesi en çok şikâyet edilen şey olur. Üst bar + detay geri tuşları var, yeni ekranlarda da korunmalı.",
  },
  {
    title: "6) Para biriminde tek kural",
    body: "Her tutar kuruş (tam sayı) olarak saklanıyor, ekranda biçimleniyor. Yeni modüllerde de bu kural bozulmasın; ondalıkla hesap yapılmasın.",
  },
  {
    title: "7) Yedek her turda",
    body: "Kod her turda zip olarak kaynaklar/yedek altına alınıyor; PostgreSQL dökümü de (pg_dump) aynı yere ekleniyor. Kod gider, veri kalır.",
  },
];

const STATUS_TR: Record<Status, string> = {
  var: "VAR",
  kismi: "KISMİ",
  yok: "YOK",
};

export function Roadmap() {
  const counts = {
    var: ROWS_VAR.length,
    kismi: ROWS_OPEN.filter((r) => r.status === "kismi").length,
    yok: ROWS_OPEN.filter((r) => r.status === "yok").length,
  };

  return (
    <div>
      <div className="page-head">
        <h2>Yol haritası</h2>
        <span className="spacer" />
        <span className="muted small">
          {counts.var} var · {counts.kismi} kısmi · {counts.yok} yok
        </span>
      </div>

      <InfoNote title="Liste artık elle yazılmıyor: her turda durum tazeleniyor.">
        Kaynak: kökteki <strong>“umay emlak program detayları benim yazdığım.txt”</strong>. Bir madde
        bitince <strong>silinmez</strong>; “VAR” durumuna geçer ve <strong>Kapananlar</strong>{" "}
        bölümüne taşınır. Sıra numarası elle yazılmaz: açık maddeler sırayla numaralanır, bir madde
        kapanınca numaralar kendiliğinden kayar. Son tazeleme: <strong>TUR:52</strong>.
      </InfoNote>

      <h3>Kapananlar (son turlar)</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Madde</th>
              <th>Tur</th>
              <th>Ne yapıldı</th>
            </tr>
          </thead>
          <tbody>
            {CLOSED.map((row) => (
              <tr key={row.title}>
                <td>{row.title}</td>
                <td>
                  <span className="chip ok">{row.turn}</span>
                </td>
                <td className="muted small">{row.what}</td>
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
            {ROWS_OPEN.map((row, index) => (
              <tr key={row.key}>
                <td>{index + 1}</td>
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

      <h3 style={{ marginTop: 22 }}>Olanlar</h3>
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
            {ROWS_VAR.map((row) => (
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

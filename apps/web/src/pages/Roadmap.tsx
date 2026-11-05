import { InfoNote } from "../components/InfoNote";

/**
 * Yol haritası — TUR:25, güncellendi TUR:47, TUR:54, TUR:55, TUR:56.
 * Kullanıcı isteği: "bilgi bankamızı yeniden oku, her özellik bizim programda var mı
 * listele, olanları ve olmayanları yaz, olmayanlar için görev sırası hazırla."
 * TUR:56 isteği: "bilgi bankasındaki benim yazdıklarımı ve yapay zekaların önerilerini
 * oku, analiz et, iş listesi oluştur; eksikler ve görevler kısmını bu listeyle güncelle."
 *
 * Tek kaynak: kökteki "umay emlak program detayları benim yazdığım.txt"
 * (kullanıcı metni + Gemini/ChatGPT/Claude/Freebuff analizleri) ve 06/08/09/10 kayıtları.
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
  { key: "komisyon", title: "Satış/kiralama komisyonu (%3) ve kapora akışı", status: "var", note: "Taslak → onay → ödendi; indirimde gerekçe zorunlu, kapora alınınca ilan kaporalıya düşer.", turn: "TUR:25" },
  { key: "dask", title: "DASK / poliçe bitiş takibi", status: "var", note: "Poliçeler ekranı bitiş tarihini tutar; otomatik hatırlatma yok (1. madde).", turn: "TUR:42" },
  { key: "randevu", title: "Randevu / yer gösterme modülü", status: "var", note: "Randevu ekranı + takvim; aday, portföy, personel, sonuç.", turn: "TUR:24" },
  { key: "kvkk", title: "KVKK iletişim izni", status: "var", note: "İzin bilinmiyor / var / yok + not." },
  { key: "mukerrer", title: "Mükerrer kişi birleştirme (silmeden)", status: "var", note: "Kaybeden kayıt arşivde kalır." },
  { key: "aktar", title: "Excel/CSV içe aktarma", status: "var", note: "İçe aktar ekranı, mükerrer açmaz." },
  { key: "guvenlik", title: "Oturum, şifre değiştirme, boşta kilit", status: "var", note: "Zorunlu şifre + IdleLock." },
  { key: "arama", title: "Genel arama (/) ve bildirim sayacı", status: "var", note: "Üst bar; sonuç sayfası 16. maddede." },
  { key: "gorev", title: "Görev listesi (arıza, bakım, hatırlatma)", status: "var", note: "Operasyon → Görevler; kiracı da bağlantıyla talebini açabiliyor (TUR:55).", turn: "TUR:44" },
  { key: "kiraciTalep", title: "Kiracı kendi arıza talebini açsın (girişsiz bağlantı)", status: "var", note: "Kiralık dosyada 90 günlük bağlantı: kiracı giriş yapmadan bildirir, talep arıza listesine düşer; iptal edilen/süresi dolan jeton 404 (TUR:55).", turn: "TUR:55" },
  { key: "tutanak", title: "Teslim tutanağı + depozito hesabı + A4 PDF", status: "var", note: "Giriş/çıkış, demirbaş, kesinti; mülkün fotoğrafları ve imza alanlarıyla PDF (TUR:28, TUR:52).", turn: "TUR:52" },
  { key: "oneri", title: "Alıcı adayına portföy önerisi", status: "var", note: "Bütçe + ilçe + oda puanlaması, gerekçeli liste (TUR:33).", turn: "TUR:33" },
  { key: "hata", title: "Anlaşılır hata mesajı + kayıt numarası", status: "var", note: "500'de \"Bu numarayla bildirin: R-…\"; aynı numara sunucu log'unda.", turn: "TUR:45" },
  { key: "denetim", title: "İşlem kaydı altyapısı (audit_log)", status: "var", note: "Her yazma isteği kim/ofis/uç/kayıt ile saklanıyor; Sistem → İşlem kaydı ekranından okunuyor (TUR:53).", turn: "TUR:46" },
  { key: "uzunListe", title: "Portföy listesi 500 kayıtta akıcı", status: "var", note: "Sanal liste: yalnız görünen satırlar basılıyor, kaydırma çubuğu tam uzunluğu gösteriyor (K-10, TUR:54).", turn: "TUR:54" },
];

/** Henüz olmayan / yarım olanlar. Sıra numarası bu dizinin sırasıdır (TUR:56). */
const ROWS_OPEN: Row[] = [
  {
    key: "hatirlat",
    title: "Otomatik hatırlatma: kira günü, sözleşme ve poliçe bitişi",
    status: "kismi",
    note: "Tek liste yapıldı (TUR:57): sözleşme + poliçe + kira panoda \"Bu ay bitecekler\". Kalan: e-posta/SMS gönderimi, okundu/ertele işareti (Y-18, Y-19, Y-84).",
  },
  {
    key: "gider",
    title: "Gider kalemleri + mal sahibi hesap ekstresi (yazdırılabilir)",
    status: "kismi",
    note: "Aktarım var; masraf tek tutar, kalem ve dekont bağı yok, ekstre yazdırılmıyor. Para tarafı burada kapanıyor (Y-16, Y-70).",
  },
  {
    key: "belgeRozet",
    title: "Belge zorunluluk matrisi: \"3/7 belge\" rozeti ve yayına alma kilidi",
    status: "kismi",
    note: "Ana sayfada eksik listesi var, mülk dosyasında rozet yok; portföy eksik belgeyle de yayına hazır sayılıyor (E2, K-19 ruhu).",
  },
  {
    key: "ayrilis",
    title: "Personel ayrılışı tek ekran: hesabı kilitle, oturumları düşür, atamaları devret",
    status: "kismi",
    note: "Üyelik \"left\" olunca oturum düşüyor ama ekranda liste ve devir adımı yok; kişi kartından tek tuşla yapılmalı (Y-61, E5).",
  },
  {
    key: "yukumluluk",
    title: "Yükümlülük motoru: tarihten türetilen iş, sorumlu, erteleme ve yükseltme",
    status: "kismi",
    note: "Bugün iş üretiyor ama işin sorumlusu, erteleme gerekçesi ve yöneticiye yükseltme yok; personel kendi listesini göremiyor (Y-72).",
  },
  {
    key: "makbuz",
    title: "Kapora makbuzu yazdırma + komisyonun finansa otomatik düşmesi",
    status: "kismi",
    note: "Komisyon ve kapora akışı çalışıyor; makbuz çıktısı ve finans panosuna düşme kaldı (Y-79).",
  },
  {
    key: "mahsup",
    title: "Tahsilat düzeltme (ters kayıt) + tek tahsilatın çok borca mahsubu",
    status: "yok",
    note: "Kural \"tahsilat silinmez, ters kayıtla düzeltilir\" ama ekran yok; kısmi ödeme geçmiş borca dağıtılamıyor (Y-09).",
  },
  {
    key: "depozito",
    title: "Depozito iadesi ve kesinti onayı akışı",
    status: "kismi",
    note: "Tutanakta kesinti/iade hesaplanıyor; iade kaydı, onay ve tarih yok (Y-14).",
  },
  {
    key: "aidat",
    title: "Aidat/fatura tahakkuku, 29-31 ödeme günü, yıllık peşin kira",
    status: "kismi",
    note: "charge_kind içinde aidat var ama üretim akışı yok; vade 1-28 ile sınırlı (Y-13, Y-71).",
  },
  {
    key: "teknik",
    title: "Mülk teknik alanları: net/brüt m², bina yaşı, ısıtma, asansör, otopark, ada/parsel",
    status: "kismi",
    note: "Bugün oda sayısı ve brüt m² var; arsa/dükkân/konut için ayrı form yok (Y-63).",
  },
  {
    key: "birlikteKiraci",
    title: "Birlikte kiracı ve bağımsız birim (oda) kiralama",
    status: "yok",
    note: "Bir ilanda tek aktif sözleşme kuralı var; iki kiracı veya oda oda kiralama modellenemiyor (Y-64).",
  },
  {
    key: "rapor",
    title: "Dönemsel raporlar + PDF/Excel dışa aktarım",
    status: "kismi",
    note: "Sayılar var; tarih aralığı seçilen rapor ve çıktı yok. Sahte grafik yok kuralı korunacak (Y-25).",
  },
  {
    key: "portal",
    title: "Mal sahibi paneli: kendi mülkü, kirası, ekstresi",
    status: "yok",
    note: "Şeffaflık yeni müşteri getirir; ayrı giriş, yalnız kendi verisi, kiracı telefonu varsayılan gizli (Y-24, Y-36, Y-62).",
  },
  {
    key: "kiraciPanel",
    title: "Kiracı paneli: sözleşme, ödeme geçmişi, dekont",
    status: "kismi",
    note: "Arıza bildirimi bağlantıyla açıldı (TUR:55); kalan giriş, ödeme ve dekont görünümü. Sanal POS yok (S-04).",
  },
  {
    key: "bildirim",
    title: "Toplu bildirim (SMS/e-posta/WhatsApp) ve KVKK ret listesi",
    status: "yok",
    note: "İzin alanı hazır ama gönderim yok; onaylı gönderim ve ret geçmişi birlikte tasarlanmalı (Y-19, Y-59).",
  },
  {
    key: "arama",
    title: "Global arama sonuç sayfası + bildirim merkezi",
    status: "kismi",
    note: "Üst bar araması yalnız kişileri süzüyor; bildirim sayacı tıklanınca liste açılmıyor (Y-48, Y-49).",
  },
  {
    key: "medya",
    title: "Video, filigranlı kopya, kapak seçimi ve kişi vesikalığı",
    status: "kismi",
    note: "Fotoğraf galerisi ve kapak var (TUR:48); video, filigran ve vesikalık alanı yok (Y-33, Y-47, Y-102).",
  },
  {
    key: "saha",
    title: "Mobil saha (PWA): kamera, belge tarama, çevrimdışı kuyruk",
    status: "yok",
    note: "Masaüstü önce kuralı sürüyor; saha için ayrı ekran seti ve gönderim kuyruğu gerekir (Y-04, Y-27).",
  },
  {
    key: "kabuk",
    title: "Masaüstü kabuk (Tauri) + kurulum, imza ve otomatik güncelleme",
    status: "kismi",
    note: "Şimdilik bat dosyası + tarayıcı; çift tıkla açılan, imzalı ve kendini güncelleyen program yok (Y-22, Y-90).",
  },
  {
    key: "banka",
    title: "Banka ekstresi eşleştirme + OCR ile belge okuma",
    status: "yok",
    note: "Mükerrer ödeme koruması (aynı havale iki kiracıya yazılmasın) burada kurulacak (Y-28, Y-80, E4).",
  },
  {
    key: "saas",
    title: "SaaS: şube/çoklu ofis, lisans, paket ve limit",
    status: "yok",
    note: "Kod müşteriye gitmiyor (K-19); lisans dosyası, makine bağı ve paket/limit tanımı yok (Y-35, Y-61, Y-75).",
  },
  {
    key: "erisim",
    title: "Erişilebilirlik: klavye gezinmesi, odak halkası, açık tema",
    status: "yok",
    note: "Yalnız \"/\" arama kısayolu var; 18 personelin günlük kullanımı için klavye ve kontrast denemesi gerekli (Y-42, Y-50, Y-51).",
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
  { title: "İşlem kaydı ekranı (kim ne yaptı)", turn: "TUR:53", what: "Sistem → İşlem kaydı: kişi, tarih aralığı ve arama süzgeci; her satırda işlem, kayıt, yol ve R-… numarası. Kayıt değiştirilemez." },
  { title: "Portföy listesinde tam sanal liste", turn: "TUR:54", what: "Yalnız görünen satırlar basılıyor; 2000+ kayıtta da sayfa ağırlaşmıyor, 'sonraki 60' düğmesi kalktı (K-10)." },
  { title: "Kiracıdan arıza/talep girişi", turn: "TUR:55", what: "Kiralık dosyada 'Bağlantı oluştur': 90 günlük jeton, kiracı giriş yapmadan /talep/<jeton> sayfasından bildirir; talep arıza listesine 'açık' düşer, iptal anında geçersiz (K-86)." },
];

const SUGGESTIONS: Array<{ title: string; body: string }> = [
  {
    title: "1) Parayı takip eden otomasyonu kurun",
    body: "Üç ajanın da aynı yeri işaret etti: kira günü, sözleşme ve poliçe bitişi kimseye haber vermiyor. Önce ana sayfada \"bu ay bitecekler\" tek listesi, sonra e-posta/SMS. Para kaybettiren yer burası.",
  },
  {
    title: "2) Ekstre ve gider kalemi olmadan mal sahibi paneli açılmasın",
    body: "Panel şeffaflık vaat ediyor; ekstre kalem kalem değilse ilk ayda güven kaybeder. Sıra: gider kalemi + ekstre yazdırma, sonra panel.",
  },
  {
    title: "3) Eksik belge dosyayı kilitlemeli",
    body: "Ana sayfada \"eksik\" listesi var ama mülk dosyası yine yayına hazır sayılıyor. Dosyaya \"3/7 belge\" rozeti ve yayına alma kilidi, ofisin en çok para kaybettiği ikinci yer.",
  },
  {
    title: "4) Para tek kuralda kalsın",
    body: "Her tutar kuruş tam sayı, biçimlendirme tek yerde; düzeltme silerek değil ters kayıtla. Yeni modüllerde de bu kural bozulmasın.",
  },
  {
    title: "5) Yedek her turda",
    body: "Kod her turda zip, PostgreSQL dökümü pg_dump ile aynı klasöre. Restore tatbikatı yapılmamış yedek, yedek değildir (K-17).",
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
        Kaynak: kökteki <strong>“umay emlak program detayları benim yazdığım.txt”</strong> (kendi
        metnin + Gemini/ChatGPT/Claude/Freebuff analizleri) ve <strong>06/08/09/10</strong> kayıtları.
        Bir madde bitince <strong>silinmez</strong>; “VAR” durumuna geçer ve <strong>Kapananlar</strong>{" "}
        bölümüne taşınır. Sıra numarası elle yazılmaz: açık maddeler sırayla numaralanır, bir madde
        kapanınca numaralar kendiliğinden kayar. Son tazeleme: <strong>TUR:60</strong> — para/iz
        sırası öne alındı, panel ve mobil işleri arkasına kondu.
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
        Bu liste kayıtlara da yazıldı: <strong>09-BILGI-BANKASI-KARSILASTIRMA.txt</strong> (TUR:56 iş
        listesi) ve <strong>06-YAPILMAYAN-SONRAYA-BIRAKILAN.txt</strong> (Y numaraları). Bir madde
        yapıldığında orada “YAPILDI” işaretlenir, satır silinmez.
      </p>
    </div>
  );
}

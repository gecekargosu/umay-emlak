import { useState } from "react";
import { api, ApiError, type ImportResult } from "../api";

/**
 * İçe aktarma ekranı.
 * Önce kuru çalıştırma: kullanıcı ne olacağını görür, sonra onaylar.
 * Aysan'ın 150 portföyünü elle girmemesi için en kritik ekran.
 */
export function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<ImportResult>(`/import${dryRun ? "?dryRun=1" : ""}`, {
        method: "POST",
        body,
      });
      if (dryRun) {
        setPreview(result);
        setApplied(null);
      } else {
        setApplied(result);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Dosya işlenemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Excel / CSV içe aktar</h2>
      <p className="muted">
        Dosyada “Ad Soyad” sütunu olmalı. Telefon, mülk, ilçe, fiyat, satılık/kiralık sütunları
        varsa otomatik eşlenir. Önce önizleme yapılır, hiçbir şey yazılmaz.
      </p>

      <div className="toolbar">
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setApplied(null);
          }}
        />
        <button type="button" disabled={!file || busy} onClick={() => void send(true)}>
          {busy ? "İşleniyor…" : "Önizle"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {preview && (
        <div className="panel">
          <h3>Önizleme — {preview.filename}</h3>
          <ul className="summary-list">
            <li>Satır: {preview.totalRows}</li>
            <li>Yeni kişi: {preview.personsCreated}</li>
            <li>Mevcut kişiye eklenecek: {preview.personsMerged}</li>
            <li>Yeni mülk: {preview.propertiesCreated}</li>
            <li>Yeni ilan: {preview.listingsCreated}</li>
            <li>Hatalı satır: {preview.errors.length}</li>
          </ul>

          {preview.errors.length > 0 && (
            <details>
              <summary>Hatalı satırları göster</summary>
              <ul>
                {preview.errors.map((e) => (
                  <li key={e.row}>
                    Satır {e.row}: {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button type="button" disabled={busy} onClick={() => void send(false)}>
            {busy ? "Aktarılıyor…" : "Onayla ve aktar"}
          </button>
        </div>
      )}

      {applied && (
        <div className="alert">
          Aktarım tamam: {applied.personsCreated} kişi, {applied.propertiesCreated} mülk,{" "}
          {applied.listingsCreated} ilan eklendi. Aynı dosyayı tekrar yüklemek mükerrer açmaz.
        </div>
      )}
    </div>
  );
}

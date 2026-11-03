import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";

/**
 * Mülk fotoğraf/video — TUR:27.
 * Yükleme çoklu; görseller ızgarada, videolar oynatıcıyla. Aynı içerik depoda tek kopya.
 */
type Media = {
  id: string;
  kind: "image" | "video";
  title: string | null;
  url: string;
};

export function PropertyMedia({ propertyId }: { propertyId: string }) {
  const [items, setItems] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Media[] }>(`/properties/${propertyId}/media`);
      setItems(data.items);
    } catch {
      setError("Fotoğraf/video listesi yüklenemedi");
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        await api(`/properties/${propertyId}/media`, { method: "POST", body });
      }
      setMessage(`${files.length} dosya eklendi.`);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Dosya yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/properties/${propertyId}/media/${id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Silinemedi");
    } finally {
      setBusy(false);
    }
  }

  const images = (items ?? []).filter((item) => item.kind === "image");
  const videos = (items ?? []).filter((item) => item.kind === "video");

  return (
    <section>
      <h4>Fotoğraflar ve videolar</h4>
      <div className="inline-form">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={(e) => void upload([...(e.target.files ?? [])])}
        />
        <span className="muted small">En fazla 50 MB · JPG/PNG/WEBP/GIF · MP4/WEBM/MOV</span>
      </div>

      {items === null && <p className="muted small">Yükleniyor…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Bu mülk için henüz fotoğraf/video yok.</p>
      )}

      {images.length > 0 && (
        <div className="media-grid">
          {images.map((item) => (
            <figure key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer">
                <img src={item.url} alt={item.title ?? "mülk fotoğrafı"} loading="lazy" />
              </a>
              <button
                type="button"
                className="ghost small-btn"
                disabled={busy}
                onClick={() => void remove(item.id)}
              >
                Sil
              </button>
            </figure>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="media-grid video">
          {videos.map((item) => (
            <figure key={item.id}>
              <video src={item.url} controls preload="metadata" />
              <button
                type="button"
                className="ghost small-btn"
                disabled={busy}
                onClick={() => void remove(item.id)}
              >
                Sil
              </button>
            </figure>
          ))}
        </div>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

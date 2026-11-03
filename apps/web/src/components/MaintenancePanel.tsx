import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";

/**
 * Arıza / bakım talebi — TUR:35 (SIRA 7).
 * Mülk dosyasında görünür: talep aç, durum ilerlet (açık → işlemde → bitti),
 * masraf/not yaz, fotoğraf ekle. Talep silinmez.
 */
type Item = {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  categoryLabel: string;
  priorityLabel: string;
  priority: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  statusLabel: string;
  reportedAt: string;
  daysOpen: number;
  costText: string | null;
  note: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  photoCount: number;
};

const CATEGORIES = [
  ["electrical", "Elektrik"],
  ["plumbing", "Su / tesisat"],
  ["heating", "Isıtma"],
  ["elevator", "Asansör"],
  ["appliance", "Beyaz eşya"],
  ["other", "Diğer"],
] as const;

const PRIORITIES = [
  ["normal", "Normal"],
  ["urgent", "Acil"],
  ["low", "Düşük"],
] as const;

function dateText(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

export function MaintenancePanel({ propertyId }: { propertyId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("plumbing");
  const [priority, setPriority] = useState<string>("normal");
  const [description, setDescription] = useState("");

  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, Array<{ id: string; url: string }>>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Item[] }>(`/maintenance?propertyId=${propertyId}`);
      setItems(data.items);
    } catch {
      setError("Arıza kayıtları yüklenemedi");
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (title.trim().length < 2) {
      setError("Arıza başlığı en az 2 harf olmalı");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/maintenance`, {
        method: "POST",
        body: JSON.stringify({ propertyId, title, category, priority, description }),
      });
      setTitle("");
      setDescription("");
      setOpenForm(false);
      setMessage("Arıza kaydı açıldı.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Kayıt açılamadı");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(item: Item, status: Item["status"]) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/maintenance/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, costText: costDrafts[item.id] ?? undefined }),
      });
      setMessage(
        status === "done"
          ? "İş bitirildi olarak işaretlendi."
          : status === "cancelled"
            ? "Talep iptal edildi."
            : "Durum güncellendi.",
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Durum güncellenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function saveCost(item: Item) {
    const draft = (costDrafts[item.id] ?? "").trim();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/maintenance/${item.id}`, { method: "PATCH", body: JSON.stringify({ costText: draft }) });
      setMessage("Masraf kaydedildi.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Masraf kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function loadPhotos(item: Item) {
    if (photos[item.id]) return;
    try {
      const data = await api<{ items: Array<{ id: string; url: string }> }>(
        `/maintenance/${item.id}/photos`,
      );
      setPhotos((current) => ({ ...current, [item.id]: data.items }));
    } catch {
      setError("Fotoğraflar yüklenemedi");
    }
  }

  async function uploadPhoto(item: Item, file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/maintenance/${item.id}/photos`, { method: "POST", body });
      setPhotos((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      await loadPhotos(item);
      await load();
      setMessage("Fotoğraf eklendi.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Fotoğraf yüklenemedi");
    } finally {
      const input = inputRefs.current[item.id];
      if (input) input.value = "";
      setBusy(false);
    }
  }

  const openCount = (items ?? []).filter((item) => item.status === "open" || item.status === "in_progress").length;

  return (
    <section>
      <h4>
        Arıza / bakım{" "}
        {items !== null && (
          <span className="muted small">
            {openCount > 0 ? `${openCount} açık talep` : "açık talep yok"}
          </span>
        )}
      </h4>

      {!openForm && (
        <button type="button" className="ghost" onClick={() => setOpenForm(true)}>
          + Arıza kaydı aç
        </button>
      )}

      {openForm && (
        <div className="inline-form">
          <input
            placeholder="Arıza başlığı (ör. mutfak musluğu akıyor)"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            placeholder="Kısa açıklama (isteğe bağlı)"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={() => void create()}>
            Kaydet
          </button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setOpenForm(false)}>
            Vazgeç
          </button>
        </div>
      )}

      {items === null && <p className="muted small">Yükleniyor…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Bu mülkte arıza kaydı yok. Kiracı bildirdiğinde buradan aç.</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="req-list">
          {items.map((item) => (
            <li key={item.id} className={item.status === "done" || item.status === "cancelled" ? "met" : "missing"}>
              <div className="inline-form">
                <strong>{item.title}</strong>
                <span className="badge">{item.statusLabel}</span>
                <span className="badge">{item.priorityLabel}</span>
                <span className="muted small">
                  {item.categoryLabel} · {dateText(item.reportedAt)}
                  {item.status === "open" || item.status === "in_progress"
                    ? ` · ${item.daysOpen} gündür açık`
                    : ""}
                </span>
              </div>
              {item.description && <p className="small">{item.description}</p>}
              {(item.reporterName || item.reporterPhone) && (
                <p className="muted small">
                  Bildiren: {item.reporterName ?? "—"}
                  {item.reporterPhone ? ` · ${item.reporterPhone}` : ""}
                </p>
              )}
              {item.costText && <p className="small">Masraf: {item.costText}</p>}

              <div className="inline-form">
                {item.status !== "in_progress" && item.status !== "done" && (
                  <button type="button" disabled={busy} onClick={() => void setStatus(item, "in_progress")}>
                    İşleme al
                  </button>
                )}
                {item.status !== "done" && (
                  <button type="button" disabled={busy} onClick={() => void setStatus(item, "done")}>
                    Bitti
                  </button>
                )}
                {item.status !== "cancelled" && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void setStatus(item, "cancelled")}
                  >
                    İptal
                  </button>
                )}
                {(item.status === "done" || item.status === "cancelled") && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void setStatus(item, "open")}>
                    Yeniden aç
                  </button>
                )}
                <input
                  placeholder="Masraf (₺)"
                  value={costDrafts[item.id] ?? ""}
                  onChange={(e) => setCostDrafts((current) => ({ ...current, [item.id]: e.target.value }))}
                  onBlur={() => void saveCost(item)}
                />
                {item.photoCount > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void loadPhotos(item)}
                  >
                    {item.photoCount} fotoğraf
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[item.id] = el;
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPhoto(item, file);
                  }}
                />
              </div>

              {(photos[item.id] ?? []).length > 0 && (
                <div className="media-grid">
                  {(photos[item.id] ?? []).map((photo) => (
                    <figure key={photo.id}>
                      <a href={photo.url} target="_blank" rel="noreferrer">
                        <img src={photo.url} alt="arıza fotoğrafı" loading="lazy" />
                      </a>
                    </figure>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <div className="alert">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

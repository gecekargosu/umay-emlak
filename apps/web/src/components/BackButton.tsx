import { api } from "../api";

/**
 * Geri tuşu — TUR:21 kullanıcı isteği: "bir yere girdiğimde yanlış girdiysem geri yapabilmeliyim".
 * Alt ekranlarda (detay paneli) onBack verilir ve paneli kapatır; verilmezse
 * tarayıcı geçmişinde bir adım geri gider.
 */
export function BackButton({
  onBack,
  label = "Geri",
  title = "Bir önceki ekrana dön",
}: {
  onBack?: () => void;
  label?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="ghost back-btn"
      title={title}
      aria-label={title}
      onClick={() => {
        if (onBack) onBack();
        else window.history.back();
      }}
    >
      ← {label}
    </button>
  );
}

/** Test/ileri kullanım için: api'yi buradan da çağırabilmek (gereksiz import uyarısını önler). */
export const _api = api;

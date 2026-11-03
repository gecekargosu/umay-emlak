import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { InfoNote } from "../components/InfoNote";

/**
 * Personeller / ekip — Y-01.
 * API hazırdı (/api/v1/team), arayüz yoktu; ana sayfadaki "Personeller"
 * kutusu buraya gelir. Onay yetkisi (K-29) yalnız ofis sahibince verilir.
 */
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  canApprove: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
};

type TeamData = { tenant: { id: string; name: string }; members: Member[] };

const ROLE_TR: Record<string, string> = {
  owner: "Ofis sahibi",
  partner: "Ortak",
  manager: "Yönetici",
  agent: "Danışman",
  finance: "Muhasebe",
  viewer: "İzleyici",
};

const ROLES = ["partner", "manager", "agent", "finance", "viewer"] as const;

export function Team({ canApprove, isOwner }: { canApprove: boolean; isOwner: boolean }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "agent" });

  const load = useCallback(async () => {
    try {
      setData(await api<TeamData>("/team"));
      setError(null);
    } catch {
      setError("Ekip listesi yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setTempPassword(null);
    try {
      const res = await api<{ tempPassword?: string }>("/team", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (res.tempPassword) {
        setTempPassword({ email: form.email, password: res.tempPassword });
      } else {
        setInfo(`${form.fullName} bu ofise eklendi (hesap zaten vardı).`);
      }
      setForm({ fullName: "", email: "", role: "agent" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Davet edilemedi");
    }
  }

  async function patch(member: Member, change: Partial<Pick<Member, "role" | "canApprove" | "status">>) {
    setError(null);
    setInfo(null);
    try {
      await api(`/team/${member.id}`, { method: "PATCH", body: JSON.stringify(change) });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Yetki değiştirilemedi");
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Personeller</h2>
      </div>
      <InfoNote title="Ofiste kim çalışıyor, kim onay verebilir?">
        Personel <strong>silinmez</strong>: işten ayrılanın üyeliği "ayrıldı" olur, geçmişi ve
        kayıtları durur (K-29). Onay yetkisi yalnız ofis sahibi ve ortağındadır; personel tahsilat
        iptali, fiyat değişikliği ve gider gibi işlemleri onaylayamaz. Yeni personel geçici şifreyle
        açılır ve <strong>ilk girişte şifresini değiştirmek zorundadır</strong> — şifre değiştirme
        ekranı henüz yok (Y-02), o yüzden geçici şifreli hesap şu an veri uçlarında kilitli kalır.
      </InfoNote>

      {error && <div className="error">{error}</div>}
      {info && <div className="alert">{info}</div>}
      {tempPassword && (
        <div className="alert">
          <strong>{tempPassword.email}</strong> için geçici şifre:{" "}
          <code>{tempPassword.password}</code>
          <div className="muted small" style={{ marginTop: 6 }}>
            Bu şifre yalnız bir kez gösterilir. Personel ilk girişte kendi şifresini belirleyecek.
          </div>
        </div>
      )}

      {canApprove && (
        <form className="inline-form" onSubmit={invite}>
          <input
            placeholder="Ad soyad"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
          <input
            placeholder="E-posta"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_TR[role]}
              </option>
            ))}
          </select>
          <button type="submit">Davet et</button>
        </form>
      )}

      {!canApprove && (
        <p className="hint">
          Personel eklemek ve yetki değiştirmek için onay yetkisi gerekir (K-29).
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>Ad soyad</th>
            <th>E-posta</th>
            <th>Rol</th>
            <th>Onay</th>
            <th>Durum</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.members.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td>
              <td className="muted">{member.email}</td>
              <td>
                {canApprove && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    onChange={(e) => void patch(member, { role: e.target.value })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_TR[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  (ROLE_TR[member.role] ?? member.role)
                )}
              </td>
              <td>
                {isOwner && member.role !== "owner" ? (
                  <label className="row-gap" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={member.canApprove}
                      onChange={(e) => void patch(member, { canApprove: e.target.checked })}
                    />
                    <span className="muted small">{member.canApprove ? "var" : "yok"}</span>
                  </label>
                ) : (
                  <span className={`chip ${member.canApprove ? "ok" : ""}`}>
                    {member.canApprove ? "var" : "yok"}
                  </span>
                )}
              </td>
              <td>
                {member.status === "left" ? (
                  <span className="chip danger">ayrıldı</span>
                ) : member.mustChangePassword ? (
                  <span className="chip warn">şifre bekliyor</span>
                ) : (
                  <span className="chip ok">aktif</span>
                )}
              </td>
              <td className="right">
                {canApprove && member.status === "active" && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void patch(member, { status: "left" })}
                  >
                    Ayrıldı
                  </button>
                )}
                {canApprove && member.status === "left" && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void patch(member, { status: "active" })}
                  >
                    Geri al
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.members.length === 0 && <p className="muted">Kayıt yok.</p>}
    </div>
  );
}

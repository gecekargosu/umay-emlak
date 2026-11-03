/**
 * TUR:31 — randevu / yer gösterme (SIRA 5).
 * Randevu açılır, sonuç "geldi" olarak işlenir ve not saklanır; kayıt silinmez.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const NOTE = "TEST randevu sonucu";

async function login(): Promise<string> {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: AYSAN, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

afterAll(async () => {
  const admin = new Client({ connectionString: process.env.MIGRATE_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("delete from appointment where result_note like 'TEST%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("randevu", () => {
  it("randevu açar, sonucu geldi olarak işler", async () => {
    const cookie = await login();
    const people = (await (
      await app.request("/api/v1/people", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; kind: string }> };
    const candidate = people.items.find((p) => p.kind === "candidate") ?? people.items[0];
    expect(candidate, "kişi yok").toBeTruthy();

    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; status: string }> };
    const listing = listings.items.find((row) => row.status === "active");

    const created = await app.request("/api/v1/appointments", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        personId: candidate!.id,
        listingId: listing?.id ?? null,
        scheduledAt: "2030-01-15T14:30",
        durationMin: 45,
        place: "TEST ofis",
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      status: string;
      statusLabel: string;
      time: string;
      durationMin: number;
    };
    expect(body.status).toBe("planned");
    expect(body.statusLabel).toBe("Planlandı");
    expect(body.time).toBe("14:30");
    expect(body.durationMin).toBe(45);

    const updated = await app.request(`/api/v1/appointments/${body.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "done", resultNote: NOTE }),
    });
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as {
      status: string;
      statusLabel: string;
      resultNote: string | null;
    };
    expect(updatedBody.status).toBe("done");
    expect(updatedBody.statusLabel).toBe("Geldi");
    expect(updatedBody.resultNote).toBe(NOTE);

    const list = (await (
      await app.request("/api/v1/appointments?from=2030-01-01&to=2030-01-31&status=done", {
        headers: { cookie },
      })
    ).json()) as { items: Array<{ id: string; personName: string }> };
    expect(list.items.some((row) => row.id === body.id)).toBe(true);
  });
});

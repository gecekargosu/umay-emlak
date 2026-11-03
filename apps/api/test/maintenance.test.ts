/**
 * TUR:35 — arıza / bakım talebi (SIRA 7).
 * Talep açılır, durum ilerler, masraf yazılır, fotoğraf eklenir; kayıt silinmez.
 */
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@umay/db";
import { app } from "../src/app.js";

const AYSAN = "aysan.kilic@umay-emlak.local";
const PASSWORD = "Umay!2026";
const TITLE = "TEST arıza kaydı";

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
    await admin.query(
      "delete from property_media where maintenance_id in (select id from maintenance_request where title like 'TEST%')",
    );
    await admin.query("delete from maintenance_request where title like 'TEST%'");
  } finally {
    await admin.end();
  }
  await closePool();
});

describe("arıza / bakım", () => {
  it("talep açar, durumu ilerletir, masraf ve fotoğraf ekler", async () => {
    const cookie = await login();

    const listings = (await (
      await app.request("/api/v1/listings", { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; status: string }> };
    const listing = listings.items.find((row) => row.status === "active") ?? listings.items[0];
    expect(listing, "ilan yok").toBeTruthy();

    const detail = (await (
      await app.request(`/api/v1/listings/${listing!.id}`, { headers: { cookie } })
    ).json()) as { property: { id: string } };
    const propertyId = detail.property.id;
    expect(propertyId).toBeTruthy();

    const created = await app.request("/api/v1/maintenance", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        propertyId,
        title: TITLE,
        description: "TEST musluk akıyor",
        category: "plumbing",
        priority: "urgent",
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      status: string;
      statusLabel: string;
      categoryLabel: string;
      priorityLabel: string;
      daysOpen: number;
    };
    expect(body.status).toBe("open");
    expect(body.statusLabel).toBe("Açık");
    expect(body.categoryLabel).toBe("Su / tesisat");
    expect(body.priorityLabel).toBe("Acil");
    expect(body.daysOpen).toBe(0);

    const started = await app.request(`/api/v1/maintenance/${body.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(started.status).toBe(200);
    expect(((await started.json()) as { status: string }).status).toBe("in_progress");

    const done = await app.request(`/api/v1/maintenance/${body.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "done", costText: "1.250,50", note: "TEST tesisatçı" }),
    });
    expect(done.status).toBe(200);
    const doneBody = (await done.json()) as { status: string; costKurus: number; costText: string };
    expect(doneBody.status).toBe("done");
    expect(doneBody.costKurus).toBe(125050);
    expect(doneBody.costText).toContain("1.250,50");

    const photo = await app.request(`/api/v1/maintenance/${body.id}/photos`, {
      method: "POST",
      headers: { cookie },
      body: (() => {
        const form = new FormData();
        form.append("file", new File([Buffer.from(PNG)], "test.png", { type: "image/png" }));
        return form;
      })(),
    });
    expect(photo.status).toBe(201);
    const photoBody = (await photo.json()) as { id: string; url: string };
    expect(photoBody.url).toContain("/media/");

    const photos = (await (
      await app.request(`/api/v1/maintenance/${body.id}/photos`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; url: string }> };
    expect(photos.items.length).toBe(1);

    const file = await app.request(`/api/v1/properties/${propertyId}/media/${photoBody.id}/file`, {
      headers: { cookie },
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");

    // Talep fotoğrafı mülk galerisinde görünmez.
    const gallery = (await (
      await app.request(`/api/v1/properties/${propertyId}/media`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string }> };
    expect(gallery.items.some((row) => row.id === photoBody.id)).toBe(false);

    const list = (await (
      await app.request(`/api/v1/maintenance?propertyId=${propertyId}`, { headers: { cookie } })
    ).json()) as { items: Array<{ id: string; photoCount: number; status: string }> };
    const row = list.items.find((item) => item.id === body.id);
    expect(row?.photoCount).toBe(1);
    expect(row?.status).toBe("done");

    const invalid = await app.request(`/api/v1/maintenance/${body.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ costText: "abc" }),
    });
    expect(invalid.status).toBe(400);
  });
});

/** 1x1 saydam PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Mülk fotoğraf/video — TUR:27 (kullanıcı isteği: "gayrimenkullerin resimleri
 * videoları önemli notları ve tüm detayları yok").
 *
 * Depo: belge deposuyla aynı (sha256, içerik adresli). Tablo yalnız meta tutar.
 * Sınır: 50 MB, yalnız image/* ve video/*.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { schema, withTenant } from "@umay/db";
import { HttpError, requirePasswordChanged, requireWrite, resolveSession } from "../session.js";
import { getObject, putObject, sha256Of } from "../storage.js";

export const mediaRoutes = new Hono();

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
};

function resolveMime(filename: string, declared: string): string | null {
  if (declared && (declared.startsWith("image/") || declared.startsWith("video/"))) return declared;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? null;
}

mediaRoutes.get("/:id/media", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const propertyId = c.req.param("id");

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({
        id: schema.propertyMedia.id,
        kind: schema.propertyMedia.kind,
        title: schema.propertyMedia.title,
        mimeType: schema.propertyMedia.mimeType,
        sizeBytes: schema.propertyMedia.sizeBytes,
        createdAt: schema.propertyMedia.createdAt,
      })
      .from(schema.propertyMedia)
      .where(
        and(
          eq(schema.propertyMedia.propertyId, propertyId),
          // Arıza talebine bağlı fotoğraflar mülk galerisinde görünmez.
          isNull(schema.propertyMedia.maintenanceId),
        ),
      )
      .orderBy(desc(schema.propertyMedia.createdAt)),
  );

  return c.json({
    items: rows.map((row) => ({
      ...row,
      url: `/api/v1/properties/${propertyId}/media/${row.id}/file`,
    })),
  });
});

mediaRoutes.post("/:id/media", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "mülk fotoğraf/video ekleme");
  const propertyId = c.req.param("id");

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new HttpError(400, "Dosya gerekli (file)");
  if (file.size === 0) throw new HttpError(400, "Dosya boş");
  if (file.size > MAX_MEDIA_BYTES) throw new HttpError(400, "Dosya 50 MB'dan büyük");

  const mimeTypeStr = resolveMime(file.name, file.type);
  if (!mimeTypeStr) throw new HttpError(400, "Yalnız fotoğraf (JPG/PNG/WEBP/GIF) veya video (MP4/WEBM/MOV)");
  const kind = mimeTypeStr.startsWith("video/") ? "video" : "image";

  const [property] = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({ id: schema.properties.id })
      .from(schema.properties)
      .where(eq(schema.properties.id, propertyId))
      .limit(1),
  );
  if (!property) throw new HttpError(404, "Gayrimenkul bulunamadı");

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256Of(bytes);
  await putObject(hash, bytes);

  const created = await withTenant(session.tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.propertyMedia)
      .values({
        tenantId: session.tenantId,
        propertyId,
        kind,
        title: String(form.get("title") ?? "").trim() || null,
        sha256: hash,
        mimeType: mimeTypeStr,
        sizeBytes: bytes.length,
        createdByUserId: session.userId,
      })
      .returning({ id: schema.propertyMedia.id });
    return row!;
  });

  return c.json(
    { id: created.id, kind, url: `/api/v1/properties/${propertyId}/media/${created.id}/file` },
    201,
  );
});

mediaRoutes.get("/:id/media/:mediaId/file", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  const mediaId = c.req.param("mediaId");

  const [row] = await withTenant(session.tenantId, async (tx) =>
    tx
      .select({ sha256: schema.propertyMedia.sha256, mimeType: schema.propertyMedia.mimeType })
      .from(schema.propertyMedia)
      .where(and(eq(schema.propertyMedia.id, mediaId), eq(schema.propertyMedia.propertyId, c.req.param("id"))))
      .limit(1),
  );
  if (!row) throw new HttpError(404, "Medya bulunamadı");

  const bytes = await getObject(row.sha256);
  if (!bytes) throw new HttpError(404, "Dosya depoda bulunamadı");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mimeType,
      "content-length": String(bytes.length),
      "cache-control": "private, max-age=300",
    },
  });
});

mediaRoutes.delete("/:id/media/:mediaId", async (c) => {
  const session = await resolveSession(c);
  requirePasswordChanged(session);
  requireWrite(session, "mülk medyası silme");

  const deleted = await withTenant(session.tenantId, async (tx) =>
    tx.execute(sql`
      delete from property_media
       where id = ${c.req.param("mediaId")}::uuid
         and property_id = ${c.req.param("id")}::uuid
      returning id
    `),
  );
  if ((deleted as unknown as { rows: unknown[] }).rows.length === 0) {
    throw new HttpError(404, "Medya bulunamadı");
  }
  return c.json({ ok: true });
});

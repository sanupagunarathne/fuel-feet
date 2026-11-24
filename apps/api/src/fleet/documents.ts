import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, ne } from 'drizzle-orm';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import type { Router } from 'express';
import { auditLog, documentAttachments, tripSheets, vehicleExpenses } from '../db/schema.js';
import { FleetError, filterQuery, id, invalid, mutate, recordAudit, requestContext, requireRow, send } from './common.js';
import type { Database } from './common.js';

export type DocumentStorage = {
  put: (key: string, contents: Buffer, type: string) => Promise<void>;
  read: (key: string) => Promise<Blob>;
};

export function supabaseStorage(url: string, key: string, bucket: string): DocumentStorage {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(20_000) }) },
  });
  const objects = client.storage.from(bucket);
  return {
    async put(object, contents, type) {
      const { error } = await objects.upload(object, contents, { upsert: false, contentType: type });
      if (error) throw error;
    },
    async read(object) {
      const { data, error } = await objects.download(object);
      if (error) throw error;
      return data;
    },
  };
}

const unavailable = () => new FleetError(503, 'STORAGE_UNAVAILABLE', 'Private document storage is unavailable. Try again later.');
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const publicMetadata = { id: documentAttachments.id, filename: documentAttachments.filename,
  mediaType: documentAttachments.mediaType, byteSize: documentAttachments.byteSize, createdAt: documentAttachments.createdAt };

function fileType(contents: Buffer) {
  if (contents.subarray(0, 5).equals(Buffer.from('%PDF-'))) return 'application/pdf';
  if (contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (contents.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  return null;
}

export function documentRoutes(router: Router, db: Database, storage?: DocumentStorage, maxBytes = 10_485_760) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 } });
  for (const parentType of ['trips', 'expenses'] as const) {
    const trips = parentType === 'trips';
    const parentColumn = trips ? documentAttachments.tripId : documentAttachments.expenseId;
    const path = `/${parentType}/:id/attachments`;
    router.get(path, async (req, res) => {
      const q = filterQuery.parse(req.query);
      send(res, await db.select(publicMetadata).from(documentAttachments)
        .where(and(eq(parentColumn, id(req.params.id)), eq(documentAttachments.status, 'READY')))
        .orderBy(desc(documentAttachments.createdAt), desc(documentAttachments.id)).limit(q.limit).offset(q.offset));
    });
    router.post(path, (_request, _response, next) => {
      if (!storage) next(unavailable());
      else next();
    }, upload.single('file'), async (req, res) => {
      const parentId = id(req.params.id);
      const ctx = requestContext(req, res);
      const file = req.file;
      if (!file) invalid('Choose one document to upload.');
      const type = fileType(file.buffer);
      if (!type || type !== file.mimetype) invalid('Upload a PDF, JPEG or PNG with matching file contents.');
      const filename = file.originalname.replace(/[/\\\p{Cc}]/gu, '_').trim().slice(0, 180) || 'Document';
      const sha256 = digest(file.buffer);
      const row = await db.transaction(async (tx) => {
        if (trips) {
          requireRow((await tx.select({ id: tripSheets.id }).from(tripSheets)
            .where(and(eq(tripSheets.id, parentId), eq(tripSheets.discarded, false))).for('share'))[0], 'Trip');
        } else {
          requireRow((await tx.select({ id: vehicleExpenses.id }).from(vehicleExpenses).where(eq(vehicleExpenses.id, parentId)))[0], 'Expense');
        }
        const match = and(eq(parentColumn, parentId), eq(documentAttachments.sha256, sha256), ne(documentAttachments.status, 'RETAINED'));
        const [inserted] = await tx.insert(documentAttachments).values({
          tripId: trips ? parentId : null, expenseId: trips ? null : parentId, uploadedById: ctx.actorId,
          byteSize: file.size, sha256, status: 'STAGED', filename, mediaType: type, objectKey: `records/${randomUUID()}`,
        }).onConflictDoNothing().returning();
        return inserted ?? requireRow((await tx.select().from(documentAttachments).where(match))[0], 'Attachment');
      });
      if (row.status === 'STAGED') {
        try {
          await storage!.put(row.objectKey, file.buffer, type);
        } catch {
          // A previous attempt may have uploaded the file before the database update completed.
          try {
            const existing = await storage!.read(row.objectKey);
            if (existing.size !== file.size || digest(Buffer.from(await existing.arrayBuffer())) !== sha256) throw unavailable();
          } catch { throw unavailable(); }
        }
        await db.transaction(async (tx) => {
          const [ready] = await tx.update(documentAttachments).set({ status: 'READY' })
            .where(and(eq(documentAttachments.id, row.id), eq(documentAttachments.status, 'STAGED'))).returning();
          if (ready) await recordAudit(tx, ctx, 'document', 'attach', row.id, null,
            { filename: ready.filename, mediaType: type, byteSize: file.size, parentType, parentId });
          else requireRow((await tx.select({ id: documentAttachments.id }).from(documentAttachments)
            .where(and(eq(documentAttachments.id, row.id), eq(documentAttachments.status, 'READY'))))[0], 'Attachment');
        });
      }
      send(res, { id: row.id, filename: row.filename }, 201);
    });
  }

  router.delete('/attachments/:id', async (req, res) => {
    const attachmentId = id(req.params.id);
    const ctx = requestContext(req, res);
    await mutate(db, ctx, 'remove-document', { attachmentId }, async (tx) => {
      const [row] = await tx.update(documentAttachments).set({ status: 'RETAINED' })
        .where(and(eq(documentAttachments.id, attachmentId), eq(documentAttachments.status, 'READY'))).returning();
      if (row) {
        await recordAudit(tx, ctx, 'document', 'remove', row.id,
          { filename: row.filename, tripId: row.tripId, expenseId: row.expenseId, status: 'READY' },
          { status: row.status });
      } else {
        requireRow((await tx.select({ id: documentAttachments.id }).from(documentAttachments)
          .where(and(eq(documentAttachments.id, attachmentId), eq(documentAttachments.status, 'RETAINED'))))[0], 'Attachment');
      }
      return attachmentId;
    });
    send(res, { id: attachmentId });
  });

  router.get('/attachments/:id/download', async (req, res) => {
    if (!storage) throw unavailable();
    const row = requireRow((await db.select().from(documentAttachments).where(and(
      eq(documentAttachments.id, id(req.params.id)), eq(documentAttachments.status, 'READY'),
    )))[0], 'Attachment');
    let bytes: Buffer;
    try {
      const blob = await storage.read(row.objectKey);
      if (blob.size !== row.byteSize || blob.size > maxBytes) throw unavailable();
      bytes = Buffer.from(await blob.arrayBuffer());
      if (digest(bytes) !== row.sha256) throw unavailable();
    } catch { throw unavailable(); }
    res.attachment(row.filename);
    res.type(row.mediaType).send(bytes);
  });

  router.get('/audit', async (req, res) => {
    const q = filterQuery.parse(req.query);
    send(res, await db.select().from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(q.limit).offset(q.offset));
  });
}

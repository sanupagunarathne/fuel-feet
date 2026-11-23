import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import type { Router } from 'express';
import { auditLog, documentAttachments, tripSheets, vehicleExpenses } from '../db/schema.js';
import { FleetError, filterQuery, id, invalid, recordAudit, requestContext, requireRow, send } from './common.js';
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
    const parentTable = trips ? tripSheets : vehicleExpenses;
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
      requireRow((await db.select({ id: parentTable.id }).from(parentTable).where(eq(parentTable.id, parentId)))[0], 'Parent record');
      const match = and(eq(parentColumn, parentId), eq(documentAttachments.sha256, sha256));
      const [inserted] = await db.insert(documentAttachments).values({
        tripId: trips ? parentId : null, expenseId: trips ? null : parentId, uploadedById: ctx.actorId,
        byteSize: file.size, sha256, status: 'STAGED', filename, mediaType: type, objectKey: `records/${randomUUID()}`,
      }).onConflictDoNothing().returning();
      const row = inserted ?? requireRow((await db.select().from(documentAttachments).where(match))[0], 'Attachment');
      if (row.status === 'RETAINED') throw new FleetError(409, 'ATTACHMENT_RETAINED', 'This document is retained in the archive.');
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
            { filename, mediaType: type, byteSize: file.size, parentType, parentId });
        });
      }
      send(res, { id: row.id, filename: row.filename }, 201);
    });
  }

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

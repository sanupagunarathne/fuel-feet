import { createHash } from 'node:crypto';
import { and, eq, gte, lt } from 'drizzle-orm';
import type { Column } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { monthInput } from '@fuel-feet/shared';
import type { createDatabase } from '../database.js';
import { auditLog, mutationRequests } from '../db/schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class FleetError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function requireRow<T>(row: T | undefined, label: string): T {
  if (row === undefined) throw new FleetError(404, 'NOT_FOUND', `${label} was not found.`);
  return row;
}

export function conflict(message: string): never {
  throw new FleetError(409, 'CONFLICT', message);
}

export function invalid(message: string): never {
  throw new FleetError(422, 'INVALID_INPUT', message);
}

export function cents(amount: string) {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function earnings(basis: bigint, basisPoints: number) {
  return (basis * BigInt(basisPoints) + 5000n) / 10000n;
}

export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item));
}

export function send(response: Response, value: unknown, status = 200) {
  response.status(status).json(jsonSafe(value));
}

export function id(value: unknown) { return z.uuid().parse(value); }

export const filterQuery = z.object({
  month: monthInput.optional(), from: z.iso.date().optional(), toExclusive: z.iso.date().optional(),
  vehicleId: z.uuid().optional(), employeeId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export function colomboMonth() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit' }).formatToParts();
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function monthStart(month: string, shift = 0) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + shift);
  return date.toISOString().slice(0, 10);
}

export function period(query: z.infer<typeof filterQuery>, monthOnly = false) {
  if (query.from || query.toExclusive) {
    if (monthOnly || query.month || !query.from || !query.toExclusive || query.from >= query.toExclusive
      || Date.parse(query.toExclusive) - Date.parse(query.from) > 366 * 86_400_000) invalid('Choose a valid reporting window of up to one year.');
    return { from: query.from, toExclusive: query.toExclusive, month: null };
  }
  const month = query.month ?? colomboMonth();
  return { from: monthStart(month), toExclusive: monthStart(month, 1), month };
}

export function dateRange(column: Column, range: ReturnType<typeof period>) {
  return and(gte(column, range.from), lt(column, range.toExclusive));
}

export function requestContext(request: Request, response: Response) {
  return {
    actorId: id(response.locals.admin.id),
    requestId: id(response.get('X-Request-Id')),
    key: z.uuid().parse(request.get('Idempotency-Key')),
  };
}
export type MutationContext = ReturnType<typeof requestContext>;

export async function recordAudit(tx: Transaction, ctx: MutationContext, entityType: string, operation: string,
  entityId: string, before: unknown, after: unknown, reason?: string) {
  await tx.insert(auditLog).values({
    actorId: ctx.actorId, requestId: ctx.requestId, entityType, operation, entityId,
    before: jsonSafe(before), after: jsonSafe(after), reason,
  });
}

export async function mutate(db: Database, ctx: MutationContext, operation: string, payload: unknown,
  work: (tx: Transaction) => Promise<string>) {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const match = and(eq(mutationRequests.actorId, ctx.actorId), eq(mutationRequests.operation, operation), eq(mutationRequests.key, ctx.key));
  return db.transaction(async (tx) => {
    const [claim] = await tx.insert(mutationRequests).values({
      actorId: ctx.actorId, operation, key: ctx.key, payloadDigest: hash, resultRef: '',
    }).onConflictDoNothing().returning({ key: mutationRequests.key });
    if (!claim) {
      const prior = requireRow((await tx.select().from(mutationRequests).where(match))[0], 'Request');
      if (prior.payloadDigest !== hash) conflict('This request key was already used for different data.');
      return prior.resultRef;
    }
    const resultRef = await work(tx);
    await tx.update(mutationRequests).set({ resultRef }).where(match);
    return resultRef;
  });
}

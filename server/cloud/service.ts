import { createHash, randomUUID } from 'node:crypto';
import type { CloudPlanDocument, CloudPlanMetadata, CloudPlanRecord, CloudPlanDeleted, CloudPlanOperation,
  CreateCloudPlanRequest, UpdateCloudPlanRequest, CloudPlanMutationRequest } from '../../src/contracts/cloudPlan';
import { CLOUD_PLAN_RETENTION_DAYS } from '../../src/contracts/cloudPlan';
import type { Database, SqlClient } from './database';
import { CloudError, notFound } from './errors';

const DAY = 86400000;
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(',')}}`;
  return JSON.stringify(value);
}
interface PlanRow { id: string; key_hash: string; document: CloudPlanDocument; revision: number; saved_at: Date | string; expires_at: Date | string }
interface Receipt { fingerprint: string; value: CloudPlanRecord | CloudPlanDeleted | CloudPlanMetadata; plan_id: string }
const iso = (value: Date | string) => new Date(value).toISOString();
const record = (row: PlanRow): CloudPlanRecord => ({ planId: row.id, revision: row.revision,
  savedAt: iso(row.saved_at), expiresAt: iso(row.expires_at), document: row.document });
const metadata = ({ document: _document, ...meta }: CloudPlanRecord): CloudPlanMetadata => meta;

/** Requires validated requests. All mutation/receipt work shares one transaction. */
export class CloudPlanService {
  constructor(readonly db: Database) {}

  private async now(client: SqlClient): Promise<Date> {
    // One authoritative clock for expiry and receipts across all app instances.
    const result = await client.query<{ time: Date | string }>('SELECT clock_timestamp() AS time');
    return new Date(result.rows[0].time);
  }

  private async lock(client: SqlClient, scope: string) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [scope]);
  }
  private async live(client: SqlClient, id: string, keyHash: string, now: Date, forUpdate = false): Promise<PlanRow> {
    const row = (await client.query<PlanRow>(`SELECT * FROM movegap_cloud.plans WHERE id=$1 AND key_hash=$2 AND expires_at>$3${forUpdate ? ' FOR UPDATE' : ''}`, [id, keyHash, now])).rows[0];
    if (!row) throw notFound();
    return row;
  }
  private async receipt(client: SqlClient, op: CloudPlanOperation, key: string, scope: string, requestId: string, fingerprint: string, now: Date) {
    const receipt = (await client.query<Receipt>(`SELECT fingerprint,value,plan_id FROM movegap_cloud.receipts
      WHERE key_hash=$1 AND operation=$2 AND scope=$3 AND request_id=$4 AND expires_at>$5`, [key, op, scope, requestId, now])).rows[0];
    if (receipt && receipt.fingerprint !== fingerprint) throw new CloudError({ code: 'REQUEST_ID_REUSED', status: 409 });
    return receipt;
  }
  private async remember(client: SqlClient, op: CloudPlanOperation, key: string, scope: string, requestId: string, fingerprint: string,
    value: CloudPlanRecord | CloudPlanMetadata | CloudPlanDeleted, now: Date) {
    await client.query(`INSERT INTO movegap_cloud.receipts(key_hash,operation,scope,request_id,plan_id,fingerprint,value,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT(key_hash,operation,scope,request_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,value=EXCLUDED.value,expires_at=EXCLUDED.expires_at`,
    [key, op, scope, requestId, value.planId, fingerprint, JSON.stringify(value), new Date(now.getTime() + DAY)]);
  }
  private async claimKey(client: SqlClient, keyHash: string) {
    const result = await client.query('INSERT INTO movegap_cloud.used_keys(key_hash) VALUES($1) ON CONFLICT DO NOTHING RETURNING key_hash', [keyHash]);
    if (!result.rows.length) throw new CloudError({ code: 'REQUEST_ID_REUSED', status: 409 });
  }

  async create(secret: string, request: CreateCloudPlanRequest): Promise<CloudPlanRecord> {
    const key = hash(secret), fingerprint = hash(canonical(request));
    return this.db.transaction(async client => {
      await this.lock(client, `key:${key}`);
      const now = await this.now(client);
      const previous = await this.receipt(client, 'create', key, '', request.requestId, fingerprint, now);
      if (previous) {
        await this.live(client, previous.plan_id, key, now);
        return previous.value as CloudPlanRecord;
      }
      await this.claimKey(client, key);
      const value: CloudPlanRecord = { planId: randomUUID(), revision: 1, document: request.document,
        savedAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLOUD_PLAN_RETENTION_DAYS * DAY).toISOString() };
      await client.query('INSERT INTO movegap_cloud.plans(id,key_hash,document,revision,saved_at,expires_at) VALUES($1,$2,$3::jsonb,$4,$5,$6)',
        [value.planId, key, JSON.stringify(value.document), value.revision, value.savedAt, value.expiresAt]);
      await this.remember(client, 'create', key, '', request.requestId, fingerprint, value, now);
      return value;
    });
  }
  async load(id: string, secret: string): Promise<CloudPlanRecord> {
    return record(await this.live(this.db, id, hash(secret), await this.now(this.db)));
  }
  async update(id: string, secret: string, request: UpdateCloudPlanRequest): Promise<CloudPlanRecord> {
    return this.mutate('update', id, secret, request) as Promise<CloudPlanRecord>;
  }
  async remove(id: string, secret: string, request: CloudPlanMutationRequest): Promise<CloudPlanDeleted> {
    return this.mutate('remove', id, secret, request) as Promise<CloudPlanDeleted>;
  }
  async rotateKey(id: string, secret: string, nextSecret: string, request: CloudPlanMutationRequest): Promise<CloudPlanMetadata> {
    return this.mutate('rotate-key', id, secret, request, nextSecret) as Promise<CloudPlanMetadata>;
  }

  private async mutate(operation: Exclude<CloudPlanOperation, 'create'>, id: string, secret: string,
    request: CloudPlanMutationRequest | UpdateCloudPlanRequest, nextSecret?: string) {
    const key = hash(secret), nextKey = nextSecret ? hash(nextSecret) : null;
    const fingerprint = hash(canonical({ ...request, nextKey }));
    return this.db.transaction(async client => {
      await this.lock(client, `plan:${id}`);
      const now = await this.now(client);
      const previous = await this.receipt(client, operation, key, id, request.requestId, fingerprint, now);
      if (previous) {
        // Deleted/rotated credentials can ONLY repeat their exact metadata receipt.
        if (operation === 'update') await this.live(client, id, key, now);
        return previous.value;
      }
      const row = await this.live(client, id, key, now, true);
      if (row.revision !== request.expectedRevision) throw new CloudError({ code: 'REVISION_CONFLICT', status: 409, currentRevision: row.revision });
      const revision = row.revision + 1;
      let value: CloudPlanRecord | CloudPlanDeleted | CloudPlanMetadata;
      if (operation === 'update' && 'document' in request) {
        value = { ...record(row), revision, document: request.document, savedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + CLOUD_PLAN_RETENTION_DAYS * DAY).toISOString() };
        await client.query('UPDATE movegap_cloud.plans SET document=$2::jsonb,revision=$3,saved_at=$4,expires_at=$5 WHERE id=$1',
          [id, JSON.stringify(value.document), revision, value.savedAt, value.expiresAt]);
      } else if (operation === 'remove') {
        await client.query('DELETE FROM movegap_cloud.plans WHERE id=$1', [id]);
        await client.query('DELETE FROM movegap_cloud.receipts WHERE plan_id=$1', [id]);
        value = { planId: id, revision, deletedAt: now.toISOString() };
      } else if (operation === 'rotate-key' && nextKey) {
        await this.lock(client, `key:${nextKey}`);
        await this.claimKey(client, nextKey);
        await client.query('UPDATE movegap_cloud.plans SET key_hash=$2,revision=$3 WHERE id=$1', [id, nextKey, revision]);
        await client.query('DELETE FROM movegap_cloud.receipts WHERE plan_id=$1', [id]);
        value = { ...metadata(record(row)), revision };
      } else throw new CloudError({ code: 'BAD_REQUEST', status: 400 });
      await this.remember(client, operation, key, id, request.requestId, fingerprint, value, now);
      return value;
    });
  }

  async rateLimit(bucketKey: string, windowSeconds: number, limit: number): Promise<void> {
    const result = await this.db.query<{ hits: number }>(`INSERT INTO movegap_cloud.rate_limits(bucket_key,bucket,hits,expires_at)
      VALUES($1, floor(extract(epoch FROM clock_timestamp())/$2)::bigint, 1, clock_timestamp()+($2*2)*interval '1 second')
      ON CONFLICT(bucket_key,bucket) DO UPDATE SET hits=movegap_cloud.rate_limits.hits+1 RETURNING hits`, [bucketKey, windowSeconds]);
    if (result.rows[0].hits > limit) throw new CloudError({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: windowSeconds });
  }

  async cleanup(): Promise<void> {
    await this.db.transaction(async client => {
      const now = await this.now(client);
      // Lock/delete plans before receipts, just like user mutations. An update
      // that extends expiry while cleanup waits must keep its replay receipt.
      await client.query(`WITH expired AS (
        DELETE FROM movegap_cloud.plans WHERE expires_at<=$1 RETURNING id
      ) DELETE FROM movegap_cloud.receipts WHERE expires_at<=$1 OR plan_id IN (SELECT id FROM expired)`, [now]);
      await client.query('DELETE FROM movegap_cloud.rate_limits WHERE expires_at<=$1', [now]);
    });
  }
}

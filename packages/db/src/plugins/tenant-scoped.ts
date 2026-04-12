/**
 * Mongoose plugin that enforces tenant isolation on every query.
 *
 * Every model that holds tenant-scoped data attaches this plugin. Pre-hooks on
 * find / findOne / findOneAndUpdate / updateOne / updateMany / deleteOne /
 * deleteMany / countDocuments / aggregate assert that the query has a
 * `restaurantId` filter set. If it doesn't, the operation throws
 * `TenantContextMissingError` immediately — there is no fallback to "all
 * tenants" because that would silently leak data across tenants.
 *
 * Bypassing the plugin requires passing `{ skipTenantGuard: true }` in the
 * Mongoose query options. Production code should ONLY use this from
 * super-admin handlers and cron jobs that have explicit cross-tenant intent.
 */

import type { Schema, Aggregate, Query } from 'mongoose';

export class TenantContextMissingError extends Error {
  public constructor(modelName: string, op: string) {
    super(
      `[tenant-scoped] ${modelName}.${op} called without restaurantId in the query. ` +
        `If this is intentional (super-admin / cron), pass { skipTenantGuard: true }.`,
    );
    this.name = 'TenantContextMissingError';
  }
}

/** Mongoose query options can carry an arbitrary `skipTenantGuard` flag. */
interface TenantSkipOption {
  skipTenantGuard?: boolean;
}

type TenantGuardQuery = Query<unknown, unknown> & {
  getOptions(): TenantSkipOption;
  getQuery(): Record<string, unknown>;
  model: { modelName: string };
};

type TenantGuardAggregate = Aggregate<unknown[]> & {
  options?: TenantSkipOption;
  pipeline(): Array<Record<string, unknown>>;
  _model?: { modelName: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMatchStage(stage: unknown): Record<string, unknown> | null {
  if (!isRecord(stage)) return null;
  const matchStage = stage['$match'];
  return isRecord(matchStage) ? matchStage : null;
}

const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'countDocuments',
] as const;

export function tenantScopedPlugin(schema: Schema): void {
  // Every tenant-scoped collection must declare restaurantId on the schema.
  if (!schema.path('restaurantId')) {
    throw new Error(
      "[tenant-scoped] schema is missing required path 'restaurantId'. " +
        'Add it before applying the tenantScopedPlugin.',
    );
  }

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, async function (this: TenantGuardQuery) {
      const opts = this.getOptions();
      if (opts.skipTenantGuard) return;

      const filter = this.getQuery();
      if (!('restaurantId' in filter) || filter.restaurantId == null) {
        throw new TenantContextMissingError(this.model.modelName, hook);
      }
    });
  }

  // Aggregate gets its own hook because the Mongoose `pre('aggregate', ...)`
  // signature is different — `this` is the Aggregate, not a Query.
  schema.pre('aggregate', async function (this: TenantGuardAggregate) {
    if (this.options?.skipTenantGuard) return;

    const pipeline = this.pipeline();
    const matchStage = getMatchStage(pipeline[0]);
    if (
      !isRecord(matchStage) ||
      !('restaurantId' in matchStage) ||
      matchStage['restaurantId'] == null
    ) {
      const modelName = this._model?.modelName ?? 'Aggregate';
      throw new TenantContextMissingError(modelName, 'aggregate');
    }
  });
}

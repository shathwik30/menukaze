import type { Schema, Aggregate, Query } from 'mongoose';

// Every tenant-scoped query MUST carry `restaurantId` or this plugin throws —
// there is no silent fallback to "all tenants". The only escape hatch is
// `{ skipTenantGuard: true }` for super-admin and cron jobs that explicitly
// intend cross-tenant reads.

export class TenantContextMissingError extends Error {
  public constructor(modelName: string, op: string) {
    super(
      `[tenant-scoped] ${modelName}.${op} called without restaurantId in the query. ` +
        `If this is intentional (super-admin / cron), pass { skipTenantGuard: true }.`,
    );
    this.name = 'TenantContextMissingError';
  }
}

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

  // Aggregate needs a separate hook: `this` is the Aggregate, not a Query.
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

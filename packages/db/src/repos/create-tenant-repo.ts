/**
 * Tenant-bound repository factory.
 *
 * Handlers do not touch raw Mongoose models. They go through `ctx.repos.*`,
 * which is constructed by the tenant middleware via
 * `createTenantRepo(model, tenantId)`. Every method automatically injects
 * `restaurantId` into the query so a handler that forgets to scope a query
 * CANNOT leak data across tenants.
 *
 * The minimal surface here is a CRUD shape; specialised methods belong on
 * domain-specific repos that wrap this one. Options arguments are intentionally
 * omitted at this stage — they will be re-introduced per-method as concrete
 * needs arise (e.g. `lean()`, `session`).
 */

import type { Model, HydratedDocument, Query, UpdateQuery, UpdateWriteOpResult } from 'mongoose';
import type * as mongoose from 'mongoose';

type FilterQuery<T> = mongoose.QueryFilter<T>;
type DeleteResult = mongoose.mongo.DeleteResult;

export interface TenantRepo<TDoc extends { restaurantId: unknown }> {
  find(filter?: FilterQuery<TDoc>): Query<HydratedDocument<TDoc>[], HydratedDocument<TDoc>>;
  findOne(filter?: FilterQuery<TDoc>): Query<HydratedDocument<TDoc> | null, HydratedDocument<TDoc>>;
  findById(id: string): Query<HydratedDocument<TDoc> | null, HydratedDocument<TDoc>>;
  create(doc: Partial<TDoc>): Promise<HydratedDocument<TDoc>>;
  updateOne(
    filter: FilterQuery<TDoc>,
    update: UpdateQuery<TDoc>,
  ): Query<UpdateWriteOpResult, HydratedDocument<TDoc>>;
  deleteOne(filter: FilterQuery<TDoc>): Query<DeleteResult, HydratedDocument<TDoc>>;
  countDocuments(filter?: FilterQuery<TDoc>): Query<number, HydratedDocument<TDoc>>;
}

/**
 * Wrap a Mongoose model so every read/write is auto-scoped to one restaurant.
 *
 * The wrapper merges `{ restaurantId }` into every filter and force-sets it
 * on every create. The underlying model still has the tenantScopedPlugin
 * installed, which throws if anything ever bypasses the wrapper and forgets
 * to set restaurantId — defence in depth.
 */
export function createTenantRepo<TDoc extends { restaurantId: unknown }>(
  model: Model<TDoc>,
  restaurantId: string,
): TenantRepo<TDoc> {
  const scope = { restaurantId } as FilterQuery<TDoc>;

  return {
    find: (filter = {}) =>
      model.find({ ...filter, ...scope }) as Query<
        HydratedDocument<TDoc>[],
        HydratedDocument<TDoc>
      >,

    findOne: (filter = {}) =>
      model.findOne({ ...filter, ...scope }) as Query<
        HydratedDocument<TDoc> | null,
        HydratedDocument<TDoc>
      >,

    findById: (id) =>
      model.findOne({ _id: id, ...scope } as FilterQuery<TDoc>) as Query<
        HydratedDocument<TDoc> | null,
        HydratedDocument<TDoc>
      >,

    create: async (doc) => {
      const created = await model.create({ ...doc, restaurantId });
      return created;
    },

    updateOne: (filter, update) =>
      model.updateOne({ ...filter, ...scope }, update) as Query<
        UpdateWriteOpResult,
        HydratedDocument<TDoc>
      >,

    deleteOne: (filter) =>
      model.deleteOne({ ...filter, ...scope }) as Query<DeleteResult, HydratedDocument<TDoc>>,

    countDocuments: (filter = {}) =>
      model.countDocuments({ ...filter, ...scope }) as Query<number, HydratedDocument<TDoc>>,
  };
}

/**
 * Menukaze db package — Mongoose connection wrapper, models, plugins, repos.
 *
 * Public surface for consumers (apps + other packages):
 *
 *   import { getMongoConnection, getModels, createTenantRepo } from '@menukaze/db';
 */

export {
  getMongoConnection,
  getMongoConfig,
  closeAllConnections,
  createConnectionFromUri,
  type DbName,
} from './client';
export { getModels, type AllModels } from './models/index';
export {
  restaurantModel,
  userModel,
  staffMembershipModel,
  menuModel,
  categoryModel,
  itemModel,
  type RestaurantDoc,
  type RestaurantModel,
  type UserDoc,
  type UserModel,
  type StaffMembershipDoc,
  type StaffMembershipModel,
  type MenuDoc,
  type MenuModel,
  type CategoryDoc,
  type CategoryModel,
  type ItemDoc,
  type ItemModel,
  type ItemModifierGroup,
  type ItemModifierOption,
} from './models/index';
export { tenantScopedPlugin, TenantContextMissingError } from './plugins/tenant-scoped';
export { createTenantRepo, type TenantRepo } from './repos/create-tenant-repo';

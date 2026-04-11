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
  tableModel,
  generateQrToken,
  orderModel,
  generatePublicOrderId,
  staffInviteModel,
  generateInviteToken,
  tableSessionModel,
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
  type TableDoc,
  type TableModel,
  type TableStatus,
  type OrderDoc,
  type OrderModel,
  type OrderChannel,
  type OrderType,
  type OrderStatus,
  type OrderLineItem,
  type OrderModifierSnapshot,
  type OrderStatusEvent,
  type OrderPayment,
  type PaymentGateway,
  type PaymentStatus,
  type StaffInviteDoc,
  type StaffInviteModel,
  type StaffRole,
  type TableSessionDoc,
  type TableSessionModel,
  type TableSessionStatus,
  type TableSessionParticipant,
} from './models/index';
export { tenantScopedPlugin, TenantContextMissingError } from './plugins/tenant-scoped';
export { createTenantRepo, type TenantRepo } from './repos/create-tenant-repo';
export { envelopeEncrypt, envelopeDecrypt } from './crypto';

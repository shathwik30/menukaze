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
  superAdminModel,
  planModel,
  subscriptionModel,
  invoiceModel,
  featureFlagModel,
  platformAuditLogModel,
  promoCodeModel,
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
  type SuperAdminDoc,
  type SuperAdminModel,
  type PlanDoc,
  type PlanModel,
  type SubscriptionDoc,
  type SubscriptionModel,
  type SubscriptionStatus,
  type SubscriptionOverrides,
  type InvoiceDoc,
  type InvoiceModel,
  type InvoiceStatus,
  type InvoiceLineItem,
  type DunningAttempt,
  type FeatureFlagDoc,
  type FeatureFlagModel,
  type PlatformAuditLogDoc,
  type PlatformAuditLogModel,
  type PromoCodeDoc,
  type PromoCodeModel,
  type PromoCodeType,
} from './models/index';
export { tenantScopedPlugin, TenantContextMissingError } from './plugins/tenant-scoped';
export { createTenantRepo, type TenantRepo } from './repos/create-tenant-repo';
export { envelopeEncrypt, envelopeDecrypt } from './crypto';
export { isObjectIdString, parseObjectId, parseObjectIds } from './object-id';
export { CAPACITY_ORDER_STATUSES, restaurantHasReachedOrderCapacity } from './order-capacity';
export { getRestaurantSupportRecipients, type SupportRecipientsResult } from './support-recipients';

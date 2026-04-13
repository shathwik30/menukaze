/**
 * Model registry. Each `*Model(connection)` factory returns the Mongoose model
 * registered against the given Connection (live or sandbox), creating it on
 * first call and returning the cached model on subsequent calls. This pattern
 * lets the same code run against either database without manual model
 * registration.
 *
 * As more collections are added, append
 * their exports here.
 */

export { restaurantModel, type RestaurantDoc, type RestaurantModel } from './restaurant';
export { userModel, type UserDoc, type UserModel } from './user';
export {
  staffMembershipModel,
  type StaffMembershipDoc,
  type StaffMembershipModel,
} from './staff-membership';
export { menuModel, type MenuDoc, type MenuModel } from './menu';
export { categoryModel, type CategoryDoc, type CategoryModel } from './category';
export {
  itemModel,
  type ItemDoc,
  type ItemModel,
  type ItemModifierGroup,
  type ItemModifierOption,
} from './item';
export {
  tableModel,
  generateQrToken,
  type TableDoc,
  type TableModel,
  type TableStatus,
} from './table';
export {
  orderModel,
  generatePublicOrderId,
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
} from './order';
export {
  staffInviteModel,
  generateInviteToken,
  type StaffInviteDoc,
  type StaffInviteModel,
  type StaffRole,
} from './staff-invite';
export {
  tableSessionModel,
  type TableSessionDoc,
  type TableSessionModel,
  type TableSessionStatus,
  type TableSessionParticipant,
} from './table-session';
export { superAdminModel, type SuperAdminDoc, type SuperAdminModel } from './super-admin';
export { planModel, type PlanDoc, type PlanModel } from './plan';
export {
  subscriptionModel,
  type SubscriptionDoc,
  type SubscriptionModel,
  type SubscriptionStatus,
  type SubscriptionOverrides,
} from './subscription';
export {
  invoiceModel,
  type InvoiceDoc,
  type InvoiceModel,
  type InvoiceStatus,
  type InvoiceLineItem,
  type DunningAttempt,
} from './invoice';
export { featureFlagModel, type FeatureFlagDoc, type FeatureFlagModel } from './feature-flag';
export {
  platformAuditLogModel,
  type PlatformAuditLogDoc,
  type PlatformAuditLogModel,
} from './platform-audit-log';
export {
  promoCodeModel,
  type PromoCodeDoc,
  type PromoCodeModel,
  type PromoCodeType,
} from './promo-code';

import type { Connection } from 'mongoose';
import { restaurantModel } from './restaurant';
import { userModel } from './user';
import { staffMembershipModel } from './staff-membership';
import { menuModel } from './menu';
import { categoryModel } from './category';
import { itemModel } from './item';
import { tableModel } from './table';
import { orderModel } from './order';
import { staffInviteModel } from './staff-invite';
import { tableSessionModel } from './table-session';
import { superAdminModel } from './super-admin';
import { planModel } from './plan';
import { subscriptionModel } from './subscription';
import { invoiceModel } from './invoice';
import { featureFlagModel } from './feature-flag';
import { platformAuditLogModel } from './platform-audit-log';
import { promoCodeModel } from './promo-code';

/**
 * Convenience accessor: `getModels(connection).Restaurant`.
 * Returns every model bound to the given connection.
 */
export function getModels(connection: Connection) {
  return {
    Restaurant: restaurantModel(connection),
    User: userModel(connection),
    StaffMembership: staffMembershipModel(connection),
    Menu: menuModel(connection),
    Category: categoryModel(connection),
    Item: itemModel(connection),
    Table: tableModel(connection),
    Order: orderModel(connection),
    StaffInvite: staffInviteModel(connection),
    TableSession: tableSessionModel(connection),
    SuperAdmin: superAdminModel(connection),
    Plan: planModel(connection),
    Subscription: subscriptionModel(connection),
    Invoice: invoiceModel(connection),
    FeatureFlag: featureFlagModel(connection),
    PlatformAuditLog: platformAuditLogModel(connection),
    PromoCode: promoCodeModel(connection),
  };
}

export type AllModels = ReturnType<typeof getModels>;

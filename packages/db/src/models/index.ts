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
export {
  reservationModel,
  type ReservationDoc,
  type ReservationModel,
  type ReservationStatus,
} from './reservation';
export { stationModel, type StationDoc, type StationModel } from './station';
export {
  auditLogModel,
  computeAuditHash,
  ZERO_HASH,
  type AuditLogDoc,
  type AuditLogModel,
} from './audit-log';
export { feedbackModel, type FeedbackDoc, type FeedbackModel } from './feedback';
export {
  customerModel,
  type CustomerDoc,
  type CustomerModel,
  type CustomerChannel,
} from './customer';
export {
  apiKeyModel,
  generateApiKey,
  hashApiKey,
  type ApiKeyDoc,
  type ApiKeyModel,
  type ApiKeyScope,
  type ApiKeyEnv,
} from './api-key';
export {
  webhookSubscriptionModel,
  generateWebhookSecret,
  type WebhookSubscriptionDoc,
  type WebhookSubscriptionModel,
} from './webhook-subscription';
export {
  webhookDeliveryModel,
  WEBHOOK_RETRY_DELAYS_MS,
  WEBHOOK_MAX_ATTEMPTS,
  type WebhookDeliveryDoc,
  type WebhookDeliveryModel,
  type WebhookDeliveryStatus,
} from './webhook-delivery';

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
import { reservationModel } from './reservation';
import { stationModel } from './station';
import { auditLogModel } from './audit-log';
import { feedbackModel } from './feedback';
import { customerModel } from './customer';
import { apiKeyModel } from './api-key';
import { webhookSubscriptionModel } from './webhook-subscription';
import { webhookDeliveryModel } from './webhook-delivery';

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
    Reservation: reservationModel(connection),
    Station: stationModel(connection),
    AuditLog: auditLogModel(connection),
    Feedback: feedbackModel(connection),
    Customer: customerModel(connection),
    ApiKey: apiKeyModel(connection),
    WebhookSubscription: webhookSubscriptionModel(connection),
    WebhookDelivery: webhookDeliveryModel(connection),
  };
}

export type AllModels = ReturnType<typeof getModels>;

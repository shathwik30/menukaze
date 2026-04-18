export { validationError, invalidEntityError } from './action-result';
export type { ActionFailure, ActionResult } from './action-result';

export {
  cartLineKey,
  cartLineUnitMinor,
  cartSubtotalMinor,
  cartItemCount,
  addCartLine,
  incrementCartLine,
  decrementCartLine,
  removeCartLine,
  setCartLineNotes,
} from './cart';
export type { CartModifier, CartLine, CartLineInput } from './cart';

export { createCartLineActions, applyRestaurantChange } from './cart-store';
export type {
  CartLinesStateSlice,
  CartLinesActionSlice,
  RestaurantScopedCartState,
} from './cart-store';

export {
  ORDER_STATUSES,
  isOrderStatus,
  TERMINAL_ORDER_STATUSES,
  TERMINAL_ORDER_STATUS_SET,
  isTerminalOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  canTransitionOrderStatus,
  ORDER_LINE_STATUSES,
  ORDER_STATUS_TRANSITION_LABELS,
  ORDER_CHANNELS,
  isOrderChannel,
  BUILT_IN_ORDER_CHANNELS,
  orderChannelKind,
  ORDER_TYPES,
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  TABLE_STATUSES,
  isTableStatus,
  TABLE_STATUS_REASONS,
  WAITER_ALERT_REASONS,
  isWaiterAlertReason,
  SESSION_UPDATE_REASONS,
  TABLE_SESSION_STATUSES,
  RESERVATION_STATUSES,
  STAFF_ROLES,
  STAFF_MEMBERSHIP_STATUSES,
  API_KEY_SCOPES,
  API_KEY_ENVS,
  WEEKDAYS,
  PAYMENT_MODE_REQUESTED_OPTIONS,
  walkInPlaceholderEmail,
  kioskPlaceholderEmail,
  DEFAULT_PREP_MINUTES,
  SESSION_FAST_FOLLOW_MS,
  SESSION_PLAUSIBLE_CAP_PER_SEAT_MINOR,
  SESSION_PLAUSIBLE_CAP_MULTIPLIER,
} from './domain';
export type {
  OrderStatus,
  OrderLineStatus,
  OrderChannel,
  OrderChannelKind,
  OrderType,
  PaymentGateway,
  PaymentStatus,
  TableStatus,
  TableStatusReason,
  WaiterAlertReason,
  SessionUpdateReason,
  TableSessionStatusValue,
  ReservationStatus,
  StaffRole,
  StaffMembershipStatus,
  ApiKeyScope,
  ApiKeyEnv,
  Weekday,
  PaymentModeRequested,
} from './domain';

export { ERROR_CODES, APIError, isAPIError } from './errors';
export type { ErrorCode, ErrorEnvelope } from './errors';

export {
  CURRENCIES,
  isCurrencyCode,
  parseCurrencyCode,
  currencyCodeOrDefault,
  minorToMajor,
  majorToMinor,
  formatMoney,
  addMoney,
} from './currency';
export type { CurrencyCode } from './currency';

export { maxSelectionsForModifierGroup, validateModifierSelection } from './modifiers';
export type {
  ModifierOptionLike,
  ModifierGroupLike,
  SelectedModifierLike,
  ResolvedModifierSelection,
} from './modifiers';

export { formatPickupNumber } from './order-reference';

export type {
  CreateIntentInput,
  PaymentIntent,
  Payment,
  Refund,
  PaymentMethod,
  WebhookEvent,
  PaymentGatewayInterface,
} from './payments';

export { isMenuScheduleActive, filterActiveMenus } from './menu-schedule';
export type { MenuScheduleDay, MenuSchedule } from './menu-schedule';

export {
  haversineMeters,
  isInsideGeofence,
  deviceFingerprint,
  ipFromHeaders,
  preCheckQrLocation,
  DEFAULT_DEVICE_SESSION_LIMIT_PER_DAY,
  DEFAULT_DEVICE_WINDOW_HOURS,
} from './qr-prevention';
export type {
  Coords,
  RestaurantGeofence,
  GeofenceResult,
  FingerprintInput,
  QrPreCheckInput,
  QrPreCheckResult,
} from './qr-prevention';

export { isoWeekdayKey, computeAvailableSlots, isReservationSlotValid } from './reservations';
export type {
  RestaurantHourEntry,
  ReservationSettings,
  BookedSlot,
  SlotOption,
} from './reservations';

export { resolvePrimaryStationId, deriveOrderStage } from './stations';
export type { DerivedOrderStage } from './stations';

export {
  objectIdSchema,
  slugSchema,
  emailSchema,
  phoneE164Schema,
  currencySchema,
  isoCountrySchema,
  isoLocaleSchema,
  ianaTimezoneSchema,
  minorAmountSchema,
  hexColorSchema,
  geoPointSchema,
  userSchema,
  staffRoleSchema,
  staffMembershipSchema,
  operatingHoursDaySchema,
  taxRuleSchema,
  restaurantHolidayModeSchema,
  restaurantThrottlingSchema,
  onboardingStepSchema,
  restaurantHardeningSchema,
  restaurantSchema,
  channelTypeSchema,
  channelSchema,
  createRestaurantInputSchema,
} from './schemas';
export type {
  User,
  StaffMembership,
  Restaurant,
  ChannelType,
  Channel,
  CreateRestaurantInput,
} from './schemas';

export {
  DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_WARNING_MINUTES,
  normalizeDineInSessionTimeoutMinutes,
  getSessionTimeoutAt,
  getSessionWarningAt,
  getSessionMsRemaining,
  isSessionExpired,
  isSessionInWarningWindow,
  getSessionMinutesRemaining,
} from './session-timeout';

export { computeTax } from './tax';
export type { TaxRule, TaxBreakdown } from './tax';

export { getZodErrorMessage } from './validation';

export {
  WEBHOOK_EVENT_TYPES,
  isWebhookEventType,
  ORDER_STATUS_TO_WEBHOOK_EVENT,
  webhookEventForOrderStatus,
  orderWebhookChannel,
  orderWebhookApiChannel,
} from './webhook-events';
export type {
  WebhookEventType,
  OrderWebhookChannelPayload,
  OrderCreatedWebhookPayload,
  OrderStatusChangedWebhookPayload,
} from './webhook-events';

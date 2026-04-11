/**
 * Model registry. Each `*Model(connection)` factory returns the Mongoose model
 * registered against the given Connection (live or sandbox), creating it on
 * first call and returning the cached model on subsequent calls. This pattern
 * lets the same code run against either database without manual model
 * registration.
 *
 * As more collections are added (channels, orders, reservations, …), append
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

import type { Connection } from 'mongoose';
import { restaurantModel } from './restaurant';
import { userModel } from './user';
import { staffMembershipModel } from './staff-membership';
import { menuModel } from './menu';
import { categoryModel } from './category';
import { itemModel } from './item';
import { tableModel } from './table';
import { orderModel } from './order';

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
  };
}

export type AllModels = ReturnType<typeof getModels>;

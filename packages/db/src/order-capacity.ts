import type { Connection, Types } from 'mongoose';
import { getModels } from './models';
import type { OrderStatus } from './models/order';

export const CAPACITY_ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'served',
  'out_for_delivery',
  'delivered',
];

export async function restaurantHasReachedOrderCapacity(
  connection: Connection,
  restaurantId: Types.ObjectId,
  maxConcurrentOrders: number,
): Promise<boolean> {
  if (!Number.isFinite(maxConcurrentOrders) || maxConcurrentOrders < 1) {
    return false;
  }

  const { Order } = getModels(connection);
  const activeOrders = await Order.countDocuments({
    restaurantId,
    status: { $in: CAPACITY_ORDER_STATUSES },
  }).exec();

  return activeOrders >= maxConcurrentOrders;
}

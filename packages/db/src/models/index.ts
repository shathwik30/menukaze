/**
 * Model registry. Each `*Model(connection)` factory returns the Mongoose model
 * registered against the given Connection (live or sandbox), creating it on
 * first call and returning the cached model on subsequent calls. This pattern
 * lets the same code run against either database without manual model
 * registration.
 *
 * As more collections are added (channels, items, orders, …), append their
 * exports here.
 */

export { restaurantModel, type RestaurantDoc, type RestaurantModel } from './restaurant';
export { userModel, type UserDoc, type UserModel } from './user';
export {
  staffMembershipModel,
  type StaffMembershipDoc,
  type StaffMembershipModel,
} from './staff-membership';

import type { Connection } from 'mongoose';
import { restaurantModel } from './restaurant';
import { userModel } from './user';
import { staffMembershipModel } from './staff-membership';

/**
 * Convenience accessor: `getModels(connection).Restaurant`.
 * Returns every model bound to the given connection.
 */
export function getModels(connection: Connection) {
  return {
    Restaurant: restaurantModel(connection),
    User: userModel(connection),
    StaffMembership: staffMembershipModel(connection),
  };
}

export type AllModels = ReturnType<typeof getModels>;

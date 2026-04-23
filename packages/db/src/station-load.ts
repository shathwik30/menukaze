import mongoose, { type Connection, type Types } from 'mongoose';
import { getModels } from './models/index';

const ACTIVE_LINE_STATUSES = ['received', 'preparing'] as const;
const ACTIVE_ORDER_STATUSES = ['received', 'confirmed', 'preparing', 'ready'] as const;

/**
 * Pick the station with the smallest active-line backlog from a list of
 * candidate station ids. Used when an item can be routed to multiple stations
 * (e.g. several grill posts) so orders get spread across the kitchen rather
 * than piling onto whichever station was first in the list.
 *
 * Runs one aggregate against the `orders` collection per call. Candidate lists
 * are usually tiny (1-3 stations) so the memory footprint is trivial.
 */
export async function pickLeastLoadedStationId(
  connection: Connection,
  restaurantId: Types.ObjectId,
  candidateStationIds: ReadonlyArray<Types.ObjectId | string>,
): Promise<Types.ObjectId | null> {
  if (candidateStationIds.length === 0) return null;
  if (candidateStationIds.length === 1) {
    const only = candidateStationIds[0];
    return only ? toObjectId(only) : null;
  }

  const { Order } = getModels(connection);
  const candidateObjectIds = candidateStationIds
    .map((id) => toObjectId(id))
    .filter((id): id is Types.ObjectId => id !== null);
  if (candidateObjectIds.length === 0) return null;

  const rows = (await Order.aggregate([
    {
      $match: {
        restaurantId,
        status: { $in: ACTIVE_ORDER_STATUSES },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.stationId': { $in: candidateObjectIds },
        'items.lineStatus': { $in: ACTIVE_LINE_STATUSES },
      },
    },
    {
      $group: {
        _id: '$items.stationId',
        openLines: { $sum: 1 },
      },
    },
  ]).exec()) as Array<{ _id: Types.ObjectId; openLines: number }>;

  const loadByStation = new Map<string, number>();
  for (const row of rows) loadByStation.set(String(row._id), row.openLines);

  let chosen = candidateObjectIds[0]!;
  let chosenLoad = loadByStation.get(String(chosen)) ?? 0;
  for (const id of candidateObjectIds) {
    const load = loadByStation.get(String(id)) ?? 0;
    if (load < chosenLoad) {
      chosen = id;
      chosenLoad = load;
    }
  }
  return chosen;
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId | null {
  if (typeof id !== 'string') return id;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

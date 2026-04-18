// Channel name vocabulary (locked — browser subscribe capabilities depend on the ':' separator):
//   restaurant:{id}:orders                    order lifecycle
//   restaurant:{id}:tables                    table state changes
//   restaurant:{id}:kds:{station}             kitchen display station feed
//   restaurant:{id}:sessions:{sessionId}      customer order tracking page
//   restaurant:{id}:order:{orderId}           single-order tracking page
//   super:health                              super-admin live metrics

const STATION_RE = /^[a-z0-9-]+$/;
const ID_RE = /^[a-f0-9]{24}$/i;

function ensureRestaurantId(id: string): void {
  if (!ID_RE.test(id)) {
    throw new Error(`[realtime] invalid restaurant id: ${id}`);
  }
}

export const channels = {
  orders(restaurantId: string): string {
    ensureRestaurantId(restaurantId);
    return `restaurant:${restaurantId}:orders`;
  },

  tables(restaurantId: string): string {
    ensureRestaurantId(restaurantId);
    return `restaurant:${restaurantId}:tables`;
  },

  kdsStation(restaurantId: string, station: string): string {
    ensureRestaurantId(restaurantId);
    if (!STATION_RE.test(station)) {
      throw new Error(`[realtime] invalid station: ${station}`);
    }
    return `restaurant:${restaurantId}:kds:${station}`;
  },

  customerSession(restaurantId: string, sessionId: string): string {
    ensureRestaurantId(restaurantId);
    if (!ID_RE.test(sessionId)) {
      throw new Error(`[realtime] invalid session id: ${sessionId}`);
    }
    return `restaurant:${restaurantId}:sessions:${sessionId}`;
  },

  customerOrder(restaurantId: string, orderId: string): string {
    ensureRestaurantId(restaurantId);
    if (!ID_RE.test(orderId)) {
      throw new Error(`[realtime] invalid order id: ${orderId}`);
    }
    return `restaurant:${restaurantId}:order:${orderId}`;
  },

  superAdminHealth(): string {
    return 'super:health';
  },
};

export const channelPatterns = {
  allRestaurant(restaurantId: string): string {
    ensureRestaurantId(restaurantId);
    return `restaurant:${restaurantId}:*`;
  },

  allRestaurantKds(restaurantId: string): string {
    ensureRestaurantId(restaurantId);
    return `restaurant:${restaurantId}:kds:*`;
  },
};

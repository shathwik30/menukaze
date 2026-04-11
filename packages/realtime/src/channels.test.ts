import { describe, expect, it } from 'vitest';
import { channelPatterns, channels } from './channels';

const RID = '507f1f77bcf86cd799439011';
const SID = '507f1f77bcf86cd799439022';

describe('channels', () => {
  it('builds the orders channel', () => {
    expect(channels.orders(RID)).toBe(`restaurant.${RID}.orders`);
  });

  it('builds the tables channel', () => {
    expect(channels.tables(RID)).toBe(`restaurant.${RID}.tables`);
  });

  it('builds a kds station channel', () => {
    expect(channels.kdsStation(RID, 'grill')).toBe(`restaurant.${RID}.kds.grill`);
  });

  it('builds a customer session channel', () => {
    expect(channels.customerSession(RID, SID)).toBe(`restaurant.${RID}.sessions.${SID}`);
  });

  it('rejects an invalid restaurant id', () => {
    expect(() => channels.orders('not-an-id')).toThrow(/invalid restaurant id/);
  });

  it('rejects an invalid station name', () => {
    expect(() => channels.kdsStation(RID, 'Grill!')).toThrow(/invalid station/);
  });

  it('rejects an invalid session id', () => {
    expect(() => channels.customerSession(RID, 'short')).toThrow(/invalid session id/);
  });
});

describe('channelPatterns', () => {
  it('builds the dashboard wildcard', () => {
    expect(channelPatterns.allRestaurant(RID)).toBe(`restaurant.${RID}.*`);
  });

  it('builds the kds wildcard', () => {
    expect(channelPatterns.allRestaurantKds(RID)).toBe(`restaurant.${RID}.kds.*`);
  });
});

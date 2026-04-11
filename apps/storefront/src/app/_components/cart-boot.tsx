'use client';

import { useEffect } from 'react';
import { useCart } from '@/stores/cart';

interface Props {
  restaurantId: string;
  currency: string;
  locale: string;
}

/**
 * Binds the Zustand cart to the current restaurant at mount. If the user
 * navigates between tenants (same browser, different subdomain), the cart
 * store detects the id change and clears itself.
 */
export function CartBoot({ restaurantId, currency, locale }: Props) {
  const setRestaurant = useCart((s) => s.setRestaurant);
  useEffect(() => {
    setRestaurant(restaurantId, currency, locale);
  }, [restaurantId, currency, locale, setRestaurant]);
  return null;
}

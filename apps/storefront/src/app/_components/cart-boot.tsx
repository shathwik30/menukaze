'use client';

import { useEffect } from 'react';
import { useCart } from '@/stores/cart';

interface Props {
  restaurantId: string;
  currency: string;
  locale: string;
}

export function CartBoot({ restaurantId, currency, locale }: Props) {
  const setRestaurant = useCart((s) => s.setRestaurant);
  useEffect(() => {
    setRestaurant(restaurantId, currency, locale);
  }, [restaurantId, currency, locale, setRestaurant]);
  return null;
}

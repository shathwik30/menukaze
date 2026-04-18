import 'server-only';
import type { HydratedDocument } from 'mongoose';
import type { ItemDoc, RestaurantDoc, TableDoc } from '@menukaze/db';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  critical: boolean;
  href?: string;
  detail?: string;
}

export interface ChecklistSummary {
  items: ChecklistItem[];
  totalCount: number;
  doneCount: number;
  criticalDoneCount: number;
  criticalTotalCount: number;
  allCriticalDone: boolean;
  allDone: boolean;
  percent: number;
}

const STEP_ORDER = ['menu', 'tables', 'razorpay', 'staff', 'go-live', 'complete'] as const;
type Step = (typeof STEP_ORDER)[number];

function stepPast(current: Step, target: Step): boolean {
  return STEP_ORDER.indexOf(current) > STEP_ORDER.indexOf(target);
}

export function computeChecklist(
  restaurant: HydratedDocument<RestaurantDoc>,
  items: HydratedDocument<ItemDoc>[],
  tables: HydratedDocument<TableDoc>[],
): ChecklistSummary {
  const step = restaurant.onboardingStep;

  // Tables step counts as complete when any table exists OR the user has
  // moved past it (explicit skip for takeaway/delivery-only operators).
  const tablesDone = tables.length > 0 || stepPast(step, 'tables');

  const hasImages = items.some((it) => Boolean(it.imageUrl));
  const hasTax = (restaurant.taxRules ?? []).length > 0;
  const hasBranding = Boolean(
    restaurant.receiptBranding?.headerColor ?? restaurant.receiptBranding?.footerText,
  );

  const list: ChecklistItem[] = [
    {
      id: 'profile',
      label: 'Restaurant profile',
      done: true,
      critical: true,
      detail: restaurant.name,
    },
    {
      id: 'menu',
      label: 'Menu items',
      done: items.length > 0,
      critical: true,
      href: items.length > 0 ? undefined : '/onboarding/menu',
      detail: `${items.length} item${items.length === 1 ? '' : 's'}`,
    },
    {
      id: 'tables',
      label: 'Tables & QR codes',
      done: tablesDone,
      critical: false,
      href: tablesDone ? undefined : '/onboarding/tables',
      detail:
        tables.length === 0
          ? stepPast(step, 'tables')
            ? 'Skipped (takeaway / delivery only)'
            : 'Not started'
          : `${tables.length} table${tables.length === 1 ? '' : 's'}`,
    },
    {
      id: 'payment',
      label: 'Payment gateway',
      done: Boolean(restaurant.razorpayKeyIdEnc),
      critical: true,
      href: restaurant.razorpayKeyIdEnc ? undefined : '/onboarding/razorpay',
      detail: restaurant.razorpayKeyIdEnc ? 'Razorpay test mode' : 'Not connected',
    },
    {
      id: 'images',
      label: 'Menu item images',
      done: hasImages,
      critical: false,
      detail: hasImages ? 'At least one image uploaded' : 'No item images yet',
    },
    {
      id: 'tax',
      label: 'Tax rates',
      done: hasTax,
      critical: false,
      detail: hasTax ? 'Tax rules configured' : 'No tax rules configured',
    },
    {
      id: 'branding',
      label: 'Receipt branding',
      done: hasBranding,
      critical: false,
      detail: hasBranding ? 'Receipt branding configured' : 'Default receipt branding',
    },
  ];

  const totalCount = list.length;
  const doneCount = list.filter((i) => i.done).length;
  const criticalTotalCount = list.filter((i) => i.critical).length;
  const criticalDoneCount = list.filter((i) => i.critical && i.done).length;

  return {
    items: list,
    totalCount,
    doneCount,
    criticalTotalCount,
    criticalDoneCount,
    allCriticalDone: criticalDoneCount === criticalTotalCount,
    allDone: doneCount === totalCount,
    percent: Math.round((doneCount / totalCount) * 100),
  };
}

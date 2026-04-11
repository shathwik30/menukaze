/**
 * The `cn()` helper used by every shadcn/ui component to merge Tailwind
 * classes with proper conflict resolution.
 *
 *   cn('px-2 py-1', condition && 'bg-red-500', 'px-4')
 *
 * Output keeps the later `px-4` and drops the earlier `px-2` because
 * tailwind-merge knows they target the same property.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

import { forwardRef, type SVGProps } from 'react';
import { cn } from '../lib/cn';

interface LogoMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Menukaze brand mark — a "plate" glyph: concentric circles with a notch,
 * evoking a dish and a seat at the table. Intended to scale from 16px to 64px.
 */
export const LogoMark = forwardRef<SVGSVGElement, LogoMarkProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('text-ink-950 dark:text-canvas-50', className)}
      {...props}
    >
      <defs>
        <linearGradient id="mk-mark-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" stroke="url(#mk-mark-g)" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="10" fill="url(#mk-mark-g)" />
      <path
        d="M16 3 A13 13 0 0 1 29 16"
        stroke="oklch(0.695 0.185 48)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22" cy="8.4" r="1.4" fill="oklch(0.695 0.185 48)" />
    </svg>
  ),
);
LogoMark.displayName = 'LogoMark';

interface WordmarkProps extends SVGProps<SVGSVGElement> {
  height?: number;
}

export const Wordmark = forwardRef<SVGSVGElement, WordmarkProps>(
  ({ height = 20, className, ...props }, ref) => (
    <svg
      ref={ref}
      height={height}
      viewBox="0 0 180 30"
      fill="none"
      aria-label="Menukaze"
      className={cn('text-ink-950 dark:text-canvas-50', className)}
      {...props}
    >
      <text
        x="0"
        y="23"
        fontFamily="var(--font-serif, Fraunces, serif)"
        fontSize="26"
        fontWeight="500"
        letterSpacing="-0.02em"
        fill="currentColor"
      >
        Menu
      </text>
      <text
        x="70"
        y="23"
        fontFamily="var(--font-serif, Fraunces, serif)"
        fontSize="26"
        fontStyle="italic"
        fontWeight="400"
        letterSpacing="-0.02em"
        fill="oklch(0.615 0.180 44)"
      >
        kaze
      </text>
    </svg>
  ),
);
Wordmark.displayName = 'Wordmark';

interface BrandRowProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BrandRow({ size = 'md', className }: BrandRowProps) {
  const sizes = {
    sm: { mark: 18, word: 15, gap: 'gap-1.5' },
    md: { mark: 24, word: 20, gap: 'gap-2' },
    lg: { mark: 36, word: 28, gap: 'gap-2.5' },
  } as const;
  const s = sizes[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      <LogoMark size={s.mark} />
      <Wordmark height={s.word} />
    </span>
  );
}

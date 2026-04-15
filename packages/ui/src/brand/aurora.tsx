import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

interface AuroraBackdropProps extends HTMLAttributes<HTMLDivElement> {
  intensity?: 'soft' | 'medium' | 'strong';
  palette?: 'warm' | 'cool' | 'duo';
}

/**
 * Aurora gradient mesh — a soft, animated, atmospheric backdrop.
 * Use behind hero sections, onboarding, sign-in. Decorative only.
 */
export const AuroraBackdrop = forwardRef<HTMLDivElement, AuroraBackdropProps>(
  ({ className, intensity = 'medium', palette = 'warm', ...props }, ref) => {
    const opacity =
      intensity === 'soft' ? 'opacity-50' : intensity === 'strong' ? 'opacity-90' : 'opacity-70';
    return (
      <div
        ref={ref}
        aria-hidden
        className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
        {...props}
      >
        <div className={cn('mk-aurora', opacity)} data-palette={palette} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent,hsl(var(--background))_75%)]" />
      </div>
    );
  },
);
AuroraBackdrop.displayName = 'AuroraBackdrop';

/**
 * Refined mesh backdrop — layered radial gradients with warm saffron + neutral
 * pulls. More understated than AuroraBackdrop. Used behind marketing surfaces.
 */
export const MeshBackdrop = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      {...props}
    >
      <div
        className="absolute -top-40 left-1/2 size-[900px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.885 0.100 68 / 0.55), oklch(0.970 0.006 86 / 0))',
        }}
      />
      <div
        className="absolute -bottom-32 -right-32 size-[600px] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.815 0.140 62 / 0.4), oklch(0.970 0.006 86 / 0))',
        }}
      />
      <div
        className="absolute -bottom-40 -left-20 size-[540px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.850 0.085 162 / 0.35), oklch(0.970 0.006 86 / 0))',
        }}
      />
    </div>
  ),
);
MeshBackdrop.displayName = 'MeshBackdrop';

/**
 * Fine grid backdrop — technical, precision-feeling. For data / command surfaces.
 */
export const GridBackdrop = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { variant?: 'dots' | 'lines' }
>(({ className, variant = 'dots', ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden
    className={cn('pointer-events-none absolute inset-0', className)}
    style={{
      backgroundImage:
        variant === 'dots'
          ? 'radial-gradient(oklch(0.14 0.016 90 / 0.06) 1px, transparent 1px)'
          : `linear-gradient(to right, oklch(0.14 0.016 90 / 0.05) 1px, transparent 1px),
             linear-gradient(to bottom, oklch(0.14 0.016 90 / 0.05) 1px, transparent 1px)`,
      backgroundSize: variant === 'dots' ? '24px 24px' : '48px 48px',
      maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
      WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
    }}
    {...props}
  />
));
GridBackdrop.displayName = 'GridBackdrop';

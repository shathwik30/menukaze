import { forwardRef, type HTMLAttributes, type ImgHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const avatarVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-medium text-ink-900 dark:text-canvas-50 ring-1 ring-black/5 dark:ring-white/10',
  {
    variants: {
      size: {
        xs: 'size-6 text-[10px] rounded-md',
        sm: 'size-8 text-xs rounded-md',
        md: 'size-10 text-sm rounded-lg',
        lg: 'size-12 text-base rounded-lg',
        xl: 'size-16 text-xl rounded-xl',
        '2xl': 'size-24 text-2xl rounded-2xl',
      },
      tone: {
        saffron: 'bg-saffron-100 text-saffron-900 dark:bg-saffron-500/20 dark:text-saffron-200',
        jade: 'bg-jade-100 text-jade-900 dark:bg-jade-500/20 dark:text-jade-200',
        rose: 'bg-mkrose-100 text-mkrose-900 dark:bg-mkrose-500/20 dark:text-mkrose-200',
        lapis: 'bg-lapis-100 text-lapis-900 dark:bg-lapis-500/20 dark:text-lapis-200',
        ink: 'bg-ink-200 text-ink-900 dark:bg-ink-700 dark:text-canvas-50',
        canvas: 'bg-canvas-100 text-ink-900 dark:bg-ink-800 dark:text-canvas-50',
      },
    },
    defaultVariants: {
      size: 'md',
      tone: 'canvas',
    },
  },
);

export interface AvatarProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  src?: string | null;
  alt?: string;
  fallback: string;
}

function toneFor(seed: string): NonNullable<VariantProps<typeof avatarVariants>['tone']> {
  const tones = ['saffron', 'jade', 'rose', 'lapis', 'canvas'] as const;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[h % tones.length]!;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, tone, src, alt, fallback, ...props }, ref) => {
    const initials = fallback
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
    const derivedTone = tone ?? toneFor(fallback);
    return (
      <span
        ref={ref}
        className={cn(avatarVariants({ size, tone: derivedTone }), className)}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt ?? fallback}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="leading-none">{initials || '•'}</span>
        )}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';

export type AvatarImgProps = ImgHTMLAttributes<HTMLImageElement>;

/**
 * Menukaze UI package.
 *
 * Phase 2 ships only the foundation: the `cn()` helper, the design tokens
 * stylesheet, and the shadcn `components.json` config. Components are added
 * incrementally in Phase 3 with `pnpm dlx shadcn@latest add <name>` from the
 * repo root, which writes them into `packages/ui/src/components/`.
 *
 * Apps consume this package via:
 *   import { cn } from '@menukaze/ui';
 *   import '@menukaze/ui/styles.css';
 */

export { cn } from './lib/cn';

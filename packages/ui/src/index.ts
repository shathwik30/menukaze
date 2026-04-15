/**
 * Menukaze UI — "Atelier" design system.
 *
 * Apps consume this package via:
 *   import { Button, Card, ... } from '@menukaze/ui';
 *   import '@menukaze/ui/styles.css';
 *
 * Fonts are loaded in each app's layout.tsx via next/font/google:
 *   const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
 *   const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' });
 *   const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
 *   <html className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}>
 */

export { cn } from './lib/cn';

// Primitives
export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
  type CardProps,
} from './components/card';
export {
  Input,
  Textarea,
  Select,
  Label,
  FieldHint,
  FieldError,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from './components/input';
export { Badge, badgeVariants, type BadgeProps } from './components/badge';
export { Separator } from './components/separator';
export { Skeleton } from './components/skeleton';
export {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  useDialogId,
} from './components/dialog';
export { ToastProvider, useToast } from './components/toast';
export { Avatar } from './components/avatar';
export { EmptyState } from './components/empty-state';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/tabs';
export { Container, PageHeader, Section } from './components/page';
export { Kbd } from './components/kbd';

// Brand components
export { LogoMark, Wordmark, BrandRow } from './brand/logo';
export { AuroraBackdrop, MeshBackdrop, GridBackdrop } from './brand/aurora';
export { Eyebrow } from './brand/eyebrow';
export { StatCard } from './brand/stat-card';

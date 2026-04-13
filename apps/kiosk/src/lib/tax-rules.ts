import type { TaxRule } from '@menukaze/shared';

interface TaxRuleLike {
  name: string;
  percent: number;
  inclusive?: boolean | null;
  scope?: 'order' | 'item' | null;
  label?: string | null;
}

export function serializeTaxRules(rules: readonly TaxRuleLike[] | null | undefined): TaxRule[] {
  return (rules ?? []).map((rule) => ({
    name: rule.name,
    percent: rule.percent,
    inclusive: Boolean(rule.inclusive),
    scope: rule.scope === 'item' ? 'item' : 'order',
    ...(rule.label ? { label: rule.label } : {}),
  }));
}

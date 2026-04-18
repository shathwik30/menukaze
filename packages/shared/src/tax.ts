export interface TaxRule {
  name: string;
  percent: number;
  inclusive: boolean;
  scope: 'order' | 'item';
  label?: string;
}

export interface TaxBreakdown {
  taxMinor: number;
  /** 0 for inclusive rules (tax already in subtotal); equals taxMinor for exclusive rules. */
  surchargeMinor: number;
}

export function computeTax(subtotalMinor: number, taxRules: TaxRule[]): TaxBreakdown {
  if (!taxRules.length || subtotalMinor <= 0) {
    return { taxMinor: 0, surchargeMinor: 0 };
  }

  let taxMinor = 0;
  let surchargeMinor = 0;

  for (const rule of taxRules) {
    if (rule.percent <= 0) continue;

    if (rule.inclusive) {
      // gross = net * (1 + rate) → tax = gross - gross / (1 + rate).
      const tax = Math.round(subtotalMinor - subtotalMinor / (1 + rule.percent / 100));
      taxMinor += tax;
    } else {
      const tax = Math.round((subtotalMinor * rule.percent) / 100);
      taxMinor += tax;
      surchargeMinor += tax;
    }
  }

  return { taxMinor, surchargeMinor };
}

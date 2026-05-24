export interface TaxRule {
  name: string;
  percent: number;
  inclusive: boolean;
  scope: 'order' | 'item';
  label?: string;
}

export interface TaxClass {
  id: string;
  name: string;
  rules: TaxRule[];
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

export interface TaxableLine {
  subtotalMinor: number;
  quantity?: number;
  taxClassId?: string | null;
}

export function computeTaxForLines(
  lines: readonly TaxableLine[],
  orderRules: readonly TaxRule[],
  taxClasses: readonly TaxClass[],
): TaxBreakdown {
  const subtotalMinor = lines.reduce((sum, line) => sum + Math.max(0, line.subtotalMinor), 0);
  const orderTax = computeTax(
    subtotalMinor,
    orderRules.filter((rule) => rule.scope !== 'item'),
  );

  const taxClassById = new Map(taxClasses.map((taxClass) => [taxClass.id, taxClass]));
  let itemTaxMinor = 0;
  let itemSurchargeMinor = 0;

  for (const line of lines) {
    if (line.subtotalMinor <= 0 || !line.taxClassId) continue;
    const taxClass = taxClassById.get(line.taxClassId);
    if (!taxClass) continue;
    const breakdown = computeTax(
      line.subtotalMinor,
      taxClass.rules.filter((rule) => rule.scope === 'item'),
    );
    itemTaxMinor += breakdown.taxMinor;
    itemSurchargeMinor += breakdown.surchargeMinor;
  }

  return {
    taxMinor: orderTax.taxMinor + itemTaxMinor,
    surchargeMinor: orderTax.surchargeMinor + itemSurchargeMinor,
  };
}

/**
 * Tax computation for Menukaze orders.
 *
 * All amounts are in integer minor units (cents, paise, etc.).
 *
 * Two tax modes:
 *   - exclusive (inclusive: false): tax is added on top of the subtotal.
 *     The customer pays subtotal + tax + delivery.
 *   - inclusive (inclusive: true): tax is already embedded in the item prices.
 *     We extract it for display/receipt purposes; the total does not increase.
 *
 * Multiple rules are applied independently and summed.
 */

export interface TaxRule {
  name: string;
  percent: number;
  inclusive: boolean;
  scope: 'order' | 'item';
  label?: string;
}

export interface TaxBreakdown {
  /** Tax amount to display on receipt / order summary. */
  taxMinor: number;
  /**
   * Amount to add to the order total.
   * For inclusive taxes this is 0 (tax is already in the subtotal).
   * For exclusive taxes this equals taxMinor.
   */
  surchargeMinor: number;
}

/**
 * Compute the tax breakdown for a given subtotal.
 *
 * Returns `{ taxMinor, surchargeMinor }`. Add `surchargeMinor` to the
 * running total; store `taxMinor` on the order document for receipts.
 */
export function computeTax(subtotalMinor: number, taxRules: TaxRule[]): TaxBreakdown {
  if (!taxRules.length || subtotalMinor <= 0) {
    return { taxMinor: 0, surchargeMinor: 0 };
  }

  let taxMinor = 0;
  let surchargeMinor = 0;

  for (const rule of taxRules) {
    if (rule.percent <= 0) continue;

    if (rule.inclusive) {
      // Tax is embedded in the price: extract it from the subtotal.
      // Derivation: grossPrice = netPrice * (1 + rate), so tax = gross - gross / (1 + rate).
      const tax = Math.round(subtotalMinor - subtotalMinor / (1 + rule.percent / 100));
      taxMinor += tax;
      // surchargeMinor stays 0 because the tax is already priced in.
    } else {
      const tax = Math.round((subtotalMinor * rule.percent) / 100);
      taxMinor += tax;
      surchargeMinor += tax;
    }
  }

  return { taxMinor, surchargeMinor };
}

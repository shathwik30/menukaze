export interface CartModifier {
  groupName: string;
  optionName: string;
  priceMinor: number;
}

export interface CartLine {
  itemId: string;
  name: string;
  priceMinor: number;
  quantity: number;
  modifiers: CartModifier[];
  notes?: string;
}

export type CartLineInput = Omit<CartLine, 'quantity'> & { quantity?: number };

function isMatchingCartLine(line: CartLine, key: string): boolean {
  return cartLineKey(line) === key;
}

export function cartLineKey(line: Pick<CartLine, 'itemId' | 'modifiers'>): string {
  const modifiersKey = line.modifiers
    .map((modifier) => `${modifier.groupName}:${modifier.optionName}`)
    .sort()
    .join('|');
  return `${line.itemId}#${modifiersKey}`;
}

export function cartLineUnitMinor(line: Pick<CartLine, 'priceMinor' | 'modifiers'>): number {
  return line.priceMinor + line.modifiers.reduce((sum, modifier) => sum + modifier.priceMinor, 0);
}

export function cartSubtotalMinor(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + cartLineUnitMinor(line) * line.quantity, 0);
}

export function cartItemCount(lines: readonly Pick<CartLine, 'quantity'>[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function addCartLine(lines: readonly CartLine[], input: CartLineInput): CartLine[] {
  const key = cartLineKey(input);
  const quantity = input.quantity ?? 1;
  const existing = lines.find((line) => isMatchingCartLine(line, key));

  if (!existing) {
    return [...lines, { ...input, quantity }];
  }

  return lines.map((line) =>
    isMatchingCartLine(line, key) ? { ...line, quantity: line.quantity + quantity } : line,
  );
}

export function incrementCartLine(lines: readonly CartLine[], key: string): CartLine[] {
  return lines.map((line) =>
    isMatchingCartLine(line, key) ? { ...line, quantity: line.quantity + 1 } : line,
  );
}

export function decrementCartLine(lines: readonly CartLine[], key: string): CartLine[] {
  return lines
    .map((line) =>
      isMatchingCartLine(line, key) ? { ...line, quantity: line.quantity - 1 } : line,
    )
    .filter((line) => line.quantity > 0);
}

export function removeCartLine(lines: readonly CartLine[], key: string): CartLine[] {
  return lines.filter((line) => !isMatchingCartLine(line, key));
}

export function setCartLineNotes(
  lines: readonly CartLine[],
  key: string,
  notes: string,
): CartLine[] {
  return lines.map((line) =>
    isMatchingCartLine(line, key) ? { ...line, notes: notes || undefined } : line,
  );
}

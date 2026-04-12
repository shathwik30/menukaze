export interface MenuImportItem {
  name: string;
  priceMajor: number;
  description?: string;
}

export interface MenuImportCategory {
  name: string;
  items: MenuImportItem[];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ');
}

function isAlias(header: string, aliases: string[]): boolean {
  return aliases.includes(normalizeHeader(header));
}

function parseCsvMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function detectColumns(headerRow: string[]): {
  name: number;
  price: number;
  category: number;
  description: number;
  consumeHeader: boolean;
} {
  const nameIndex = headerRow.findIndex((value) => isAlias(value, ['item', 'name', 'item name']));
  const priceIndex = headerRow.findIndex((value) =>
    isAlias(value, ['price', 'amount', 'price major']),
  );
  const categoryIndex = headerRow.findIndex((value) =>
    isAlias(value, ['category', 'section', 'group']),
  );
  const descriptionIndex = headerRow.findIndex((value) =>
    isAlias(value, ['description', 'details', 'notes']),
  );

  const consumeHeader =
    nameIndex >= 0 || priceIndex >= 0 || categoryIndex >= 0 || descriptionIndex >= 0;
  return {
    name: nameIndex >= 0 ? nameIndex : 0,
    price: priceIndex >= 0 ? priceIndex : 1,
    category: categoryIndex >= 0 ? categoryIndex : 2,
    description: descriptionIndex >= 0 ? descriptionIndex : 3,
    consumeHeader,
  };
}

export function parseMenuCsvImport(
  input: string,
  defaultCategoryName = 'General',
): MenuImportCategory[] {
  const rows = parseCsvMatrix(input);
  if (rows.length === 0) {
    throw new Error('Paste at least one CSV row.');
  }

  const columns = detectColumns(rows[0] ?? []);
  const dataRows = columns.consumeHeader ? rows.slice(1) : rows;
  if (dataRows.length === 0) {
    throw new Error('The CSV only contains a header row.');
  }

  const categories = new Map<string, MenuImportCategory>();

  dataRows.forEach((row, index) => {
    const lineNumber = index + (columns.consumeHeader ? 2 : 1);
    const name = (row[columns.name] ?? '').trim();
    const rawPrice = (row[columns.price] ?? '').trim();
    const categoryName = (row[columns.category] ?? '').trim() || defaultCategoryName.trim();
    const description = (row[columns.description] ?? '').trim();

    if (!name && !rawPrice && !description) return;
    if (!name) throw new Error(`Row ${lineNumber}: item name is required.`);

    const priceMajor = Number(rawPrice);
    if (!Number.isFinite(priceMajor) || priceMajor < 0) {
      throw new Error(`Row ${lineNumber}: price must be a valid non-negative number.`);
    }

    const bucket = categories.get(categoryName) ?? { name: categoryName, items: [] };
    bucket.items.push({
      name,
      priceMajor,
      ...(description ? { description } : {}),
    });
    categories.set(categoryName, bucket);
  });

  const result = Array.from(categories.values()).filter((category) => category.items.length > 0);
  if (result.length === 0) {
    throw new Error('No valid menu rows were found in the CSV.');
  }
  return result;
}

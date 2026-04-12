import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toDataURL } from 'qrcode';

export interface QrPdfTable {
  name: string;
  qrUrl: string;
}

export async function buildTablesPdf(input: {
  restaurantName: string;
  tables: QrPdfTable[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 28;
  const gap = 18;
  const columns = 2;
  const rows = 3;
  const cardsPerPage = columns * rows;
  const cardWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (pageHeight - margin * 2 - gap * (rows - 1)) / rows;

  for (let index = 0; index < input.tables.length; index += 1) {
    let page = pdf.getPages()[pdf.getPageCount() - 1];
    if (index % cardsPerPage === 0 || !page) {
      page = pdf.addPage([pageWidth, pageHeight]);
    }
    const slot = index % cardsPerPage;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const x = margin + column * (cardWidth + gap);
    const y = pageHeight - margin - (row + 1) * cardHeight - row * gap;
    const table = input.tables[index]!;

    page.drawRectangle({
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      borderWidth: 1,
      borderColor: rgb(0.88, 0.89, 0.91),
    });

    const qrPng = await toDataURL(table.qrUrl, {
      errorCorrectionLevel: 'H',
      margin: 0,
      width: 512,
    });
    const qrBytes = Uint8Array.from(Buffer.from(qrPng.split(',')[1] ?? '', 'base64'));
    const qrImage = await pdf.embedPng(qrBytes);
    const qrSize = Math.min(cardWidth - 48, cardHeight - 92, 165);
    const qrX = x + (cardWidth - qrSize) / 2;
    const qrY = y + 44;

    page.drawText(input.restaurantName, {
      x: x + 20,
      y: y + cardHeight - 28,
      size: 10,
      font,
      color: rgb(0.35, 0.36, 0.41),
    });
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });
    page.drawText(table.name, {
      x: x + 20,
      y: y + 20,
      size: 16,
      font: bold,
      color: rgb(0.09, 0.1, 0.12),
    });
    page.drawText('Scan to order · Pay when you are done', {
      x: x + 20,
      y: y + 8,
      size: 9,
      font,
      color: rgb(0.45, 0.46, 0.5),
    });
  }

  return pdf.save();
}

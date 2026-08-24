import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type OrderForPdf = {
  code: string;
  created_at: string;
  expected_delivery_date: string | null;
  delivery_place: string | null;
  notes: string | null;
  subtotal: number | null;
  total: number | null;
  establishment: { name: string; address: string | null; nit: string | null };
  supplier: { legal_name: string; trade_name: string | null; nit: string | null; contact_name: string | null; phone: string | null };
  buyer: { full_name: string };
  items: Array<{
    description: string;
    quantity: number;
    unit_code: string;
    agreed_unit_price: number | null;
    line_total: number | null;
  }>;
};

const PAGE_WIDTH = 595; // A4
const PAGE_HEIGHT = 842;
const MARGIN = 45;

function formatCOP(value: number | null) {
  if (value === null || value === undefined) return '-';
  return '$' + value.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

// Genera el PDF de una orden de compra/servicio. Devuelve los bytes listos para
// subir a Supabase Storage — no escribe a disco (corre en Server Action/Edge).
export async function generatePurchaseOrderPdf(order: OrderForPdf): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let currentPage = page;
  let y = PAGE_HEIGHT - MARGIN;

  const draw = (text: string, x: number, size = 10, useBold = false, color = rgb(0.1, 0.1, 0.1)) => {
    currentPage.drawText(text, { x, y, size, font: useBold ? bold : font, color });
  };
  const newLine = (h = 16) => (y -= h);

  // Encabezado
  draw(order.establishment.name, MARGIN, 16, true);
  newLine(18);
  if (order.establishment.address) { draw(order.establishment.address, MARGIN, 9, false, rgb(0.4, 0.4, 0.4)); newLine(12); }
  if (order.establishment.nit) { draw(`NIT: ${order.establishment.nit}`, MARGIN, 9, false, rgb(0.4, 0.4, 0.4)); newLine(12); }

  draw('ORDEN DE COMPRA', PAGE_WIDTH - MARGIN - 160, 16, true);
  currentPage.drawText(order.code, { x: PAGE_WIDTH - MARGIN - 160, y: y - 18, size: 12, font: bold, color: rgb(0.3, 0.1, 0.6) });
  currentPage.drawText(new Date(order.created_at).toLocaleDateString('es-CO'), { x: PAGE_WIDTH - MARGIN - 160, y: y - 34, size: 9, font });

  newLine(30);
  currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  newLine(20);

  // Datos del proveedor
  draw('Proveedor', MARGIN, 10, true); newLine(14);
  draw(order.supplier.trade_name || order.supplier.legal_name, MARGIN, 10); newLine(13);
  if (order.supplier.nit) { draw(`NIT: ${order.supplier.nit}`, MARGIN, 9, false, rgb(0.4, 0.4, 0.4)); newLine(12); }
  if (order.supplier.contact_name) { draw(`Contacto: ${order.supplier.contact_name}${order.supplier.phone ? ' · ' + order.supplier.phone : ''}`, MARGIN, 9, false, rgb(0.4, 0.4, 0.4)); newLine(12); }

  newLine(6);
  if (order.expected_delivery_date) {
    draw(`Fecha esperada de entrega: ${new Date(order.expected_delivery_date).toLocaleDateString('es-CO')}`, MARGIN, 9);
    newLine(13);
  }
  if (order.delivery_place) { draw(`Lugar de entrega: ${order.delivery_place}`, MARGIN, 9); newLine(13); }
  draw(`Elaborada por: ${order.buyer.full_name}`, MARGIN, 9); newLine(20);

  // Tabla de ítems
  const colX = { desc: MARGIN, qty: 300, unit: 350, price: 400, total: 480 };
  const drawTableHeader = () => {
    currentPage.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_WIDTH - 2 * MARGIN, height: 18, color: rgb(0.94, 0.94, 0.96) });
    draw('Producto / Servicio', colX.desc + 4, 9, true);
    draw('Cant.', colX.qty, 9, true);
    draw('Unidad', colX.unit, 9, true);
    draw('V. Unit.', colX.price, 9, true);
    draw('Total', colX.total, 9, true);
    newLine(20);
  };
  drawTableHeader();

  for (const item of order.items) {
    if (y < 100) { // salto de página si la orden tiene muchos ítems
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }
    draw(item.description.slice(0, 42), colX.desc + 4, 9);
    draw(String(item.quantity), colX.qty, 9);
    draw(item.unit_code, colX.unit, 9);
    draw(formatCOP(item.agreed_unit_price), colX.price, 9);
    draw(formatCOP(item.line_total), colX.total, 9);
    newLine(16);
  }

  newLine(10);
  currentPage.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  newLine(20);

  draw('Subtotal', colX.price, 10, true);
  draw(formatCOP(order.subtotal), colX.total, 10);
  newLine(16);
  draw('TOTAL (impuestos incluidos)', colX.price - 60, 11, true);
  draw(formatCOP(order.total), colX.total, 11, true);

  if (order.notes) {
    newLine(30);
    draw('Observaciones', MARGIN, 9, true);
    newLine(13);
    draw(order.notes.slice(0, 110), MARGIN, 9, false, rgb(0.4, 0.4, 0.4));
  }

  return pdfDoc.save();
}

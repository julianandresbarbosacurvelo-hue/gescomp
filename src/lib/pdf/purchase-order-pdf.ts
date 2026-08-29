import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { COMPANY_LOGO_PNG_BASE64 } from './assets/company-logo';

// Datos fiscales de Grupo Evolución Capital SAS (RUT), la razón social única que opera
// ambos establecimientos (Hotel Boutique Axagua y Cielo & Sazón - Restaurante). Van fijos
// aquí — y no en establishments.nit — porque ese campo es "unique" en la base de datos y
// los dos establecimientos comparten el mismo NIT al ser la misma persona jurídica. Esta
// es la información que el proveedor necesita para expedir su factura electrónica a nombre
// correcto del comprador.
const COMPANY_NAME = 'GRUPO EVOLUCIÓN CAPITAL SAS';
const COMPANY_NIT = '901.817.361-1';
const COMPANY_ADDRESS = 'Cra 30 No. 41-26, Villavicencio, Meta';
const COMPANY_PHONE = '311 475 6652';
const COMPANY_EMAIL = 'grupoevolucioncapital@gmail.com';

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

const logoImage = await pdfDoc.embedPng(Buffer.from(COMPANY_LOGO_PNG_BASE64, 'base64'));

const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let currentPage = page;
  let y = PAGE_HEIGHT - MARGIN;

const draw = (text: string, x: number, size = 10, useBold = false, color = rgb(0.1, 0.1, 0.1)) => {
  currentPage.drawText(text, { x, y, size, font: useBold ? bold : font, color });
};
  const newLine = (h = 16) => (y -= h);

// FIX (solapamiento Subtotal/TOTAL): dibuja el texto alineado a la derecha,
// midiendo su ancho real con la fuente en vez de calcular posiciones X a mano.
// Así el texto nunca invade la columna vecina, sin importar cuán largo sea
// ("Subtotal" vs "TOTAL (impuestos incluidos)") ni cuántos dígitos tenga el monto.
const drawRightAligned = (text: string, rightX: number, size = 10, useBold = false, color = rgb(0.1, 0.1, 0.1)) => {
  const activeFont = useBold ? bold : font;
  const textWidth = activeFont.widthOfTextAtSize(text, size);
  currentPage.drawText(text, { x: rightX - textWidth, y, size, font: activeFont, color });
};

// Encabezado — logo + datos fiscales del comprador (necesarios para que el proveedor
// facture electrónicamente a nombre correcto), a la izquierda; orden y fecha a la
// derecha, siempre alineadas al tope del encabezado sin importar cuántas líneas use
// el bloque izquierdo (antes esa alineación dependía del flujo de arriba y se corría).
const headerTopY = y;
  const LOGO_WIDTH = 68;
  const LOGO_HEIGHT = (LOGO_WIDTH / logoImage.width) * logoImage.height;
  currentPage.drawImage(logoImage, { x: MARGIN, y: headerTopY + 8 - LOGO_HEIGHT, width: LOGO_WIDTH, height: LOGO_HEIGHT });

const infoX = MARGIN + LOGO_WIDTH + 14;
  draw(COMPANY_NAME, infoX, 13, true); newLine(15);
  draw(`NIT ${COMPANY_NIT} · Responsable de IVA`, infoX, 8, false, rgb(0.4, 0.4, 0.4)); newLine(11);
  draw(`Punto de compra: ${order.establishment.name}`, infoX, 9, false, rgb(0.4, 0.4, 0.4)); newLine(12);
  draw(`${COMPANY_ADDRESS} · Tel. ${COMPANY_PHONE}`, infoX, 8, false, rgb(0.4, 0.4, 0.4)); newLine(11);
  draw(COMPANY_EMAIL, infoX, 8, false, rgb(0.4, 0.4, 0.4)); newLine(11);
  y = Math.min(y, headerTopY + 8 - LOGO_HEIGHT);

currentPage.drawText('ORDEN DE COMPRA', { x: PAGE_WIDTH - MARGIN - 160, y: headerTopY - 2, size: 15, font: bold, color: rgb(0.1, 0.1, 0.1) });
  currentPage.drawText(order.code, { x: PAGE_WIDTH - MARGIN - 160, y: headerTopY - 20, size: 12, font: bold, color: rgb(0.3, 0.1, 0.6) });
  currentPage.drawText(new Date(order.created_at).toLocaleDateString('es-CO'), { x: PAGE_WIDTH - MARGIN - 160, y: headerTopY - 36, size: 9, font });

newLine(16);
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

// Los montos se alinean a la derecha del margen de la página; las etiquetas
// se alinean a la derecha justo antes de donde empieza el monto correspondiente,
// con 20px de separación — ambos calculados dinámicamente, nunca a mano.
const amountsRightEdge = PAGE_WIDTH - MARGIN;
  const LABEL_GAP = 20;

const subtotalText = formatCOP(order.subtotal);
  drawRightAligned(subtotalText, amountsRightEdge, 10, false);
  const subtotalLabelRightX = amountsRightEdge - font.widthOfTextAtSize(subtotalText, 10) - LABEL_GAP;
  drawRightAligned('Subtotal', subtotalLabelRightX, 10, true);
  newLine(16);

const totalText = formatCOP(order.total);
  drawRightAligned(totalText, amountsRightEdge, 11, true);
  const totalLabelRightX = amountsRightEdge - bold.widthOfTextAtSize(totalText, 11) - LABEL_GAP;
  drawRightAligned('TOTAL (impuestos incluidos)', totalLabelRightX, 11, true);

if (order.notes) {
  newLine(30);
  draw('Observaciones', MARGIN, 9, true);
  newLine(13);
  draw(order.notes.slice(0, 110), MARGIN, 9, false, rgb(0.4, 0.4, 0.4));
}

return pdfDoc.save();
}

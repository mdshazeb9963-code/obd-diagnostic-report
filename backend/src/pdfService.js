import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(__dirname, "../node_modules/@fontsource");
const pdfFonts = {
  NotoLatin: path.join(fontDirectory, "noto-sans-devanagari/files/noto-sans-devanagari-latin-400-normal.woff"),
  NotoArabic: path.join(fontDirectory, "noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
  NotoDevanagari: path.join(fontDirectory, "noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff"),
  NotoBengali: path.join(fontDirectory, "noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff"),
  NotoGurmukhi: path.join(fontDirectory, "noto-sans-gurmukhi/files/noto-sans-gurmukhi-gurmukhi-400-normal.woff"),
  NotoGujarati: path.join(fontDirectory, "noto-sans-gujarati/files/noto-sans-gujarati-gujarati-400-normal.woff"),
  NotoTamil: path.join(fontDirectory, "noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff"),
  NotoTelugu: path.join(fontDirectory, "noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff"),
  NotoKannada: path.join(fontDirectory, "noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff"),
  NotoMalayalam: path.join(fontDirectory, "noto-sans-malayalam/files/noto-sans-malayalam-malayalam-400-normal.woff")
};
const scriptRuns = /[\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+|[\u0900-\u097F]+|[\u0980-\u09FF]+|[\u0A00-\u0A7F]+|[\u0A80-\u0AFF]+|[\u0B80-\u0BFF]+|[\u0C00-\u0C7F]+|[\u0C80-\u0CFF]+|[\u0D00-\u0D7F]+|[^\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u0D7F]+/gu;

function fontForText(text) {
  if (/[\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text)) return "NotoArabic";
  if (/[\u0900-\u097F]/u.test(text)) return "NotoDevanagari";
  if (/[\u0980-\u09FF]/u.test(text)) return "NotoBengali";
  if (/[\u0A00-\u0A7F]/u.test(text)) return "NotoGurmukhi";
  if (/[\u0A80-\u0AFF]/u.test(text)) return "NotoGujarati";
  if (/[\u0B80-\u0BFF]/u.test(text)) return "NotoTamil";
  if (/[\u0C00-\u0C7F]/u.test(text)) return "NotoTelugu";
  if (/[\u0C80-\u0CFF]/u.test(text)) return "NotoKannada";
  if (/[\u0D00-\u0D7F]/u.test(text)) return "NotoMalayalam";
  return "NotoLatin";
}

function addMultilingualText(doc, value, x, y, options = {}) {
  const text = String(value);
  const chunks = text.match(scriptRuns) || [text];
  chunks.forEach((chunk, index) => {
    doc.font(fontForText(chunk)).fontSize(options.fontSize || 11).fillColor(options.color || "#17212f");
    doc.text(chunk, index === 0 ? x : undefined, index === 0 ? y : undefined, {
      width: options.width,
      align: options.align || "left",
      lineGap: options.lineGap || 0,
      continued: index < chunks.length - 1
    });
  });
}

function addHeader(doc, report) {
  doc.rect(0, 0, doc.page.width, 112).fill("#12304a");
  doc.font("Helvetica-Bold").fontSize(21).fillColor("#ffffff")
    .text("OBD Diagnostic Report", 54, 35);
  doc.font("Helvetica").fontSize(10).fillColor("#d9e7f2")
    .text(`Car ID ${report.carId}  ·  ${report.createdAt}`, 54, 72);
  doc.y = 142;
}

function addField(doc, label, value, language) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#526071")
    .text(label.toUpperCase(), 54, y, { width: 125, lineBreak: false });
  const rightToLeft = ["Arabic", "Urdu", "Persian", "Pashto"].includes(language);
  addMultilingualText(doc, value, 180, y, { width: 360, fontSize: 11, align: rightToLeft ? "right" : "left" });
  doc.y = Math.max(doc.y, y + 14) + 12;
}

function sectionTitle(doc, title) {
  doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).fillColor("#12304a")
    .text(title.toUpperCase(), 54, doc.y);
  doc.moveTo(54, doc.y + 7).lineTo(541, doc.y + 7)
    .lineWidth(1).strokeColor("#d9e0e7").stroke();
  doc.y += 20;
}

export function writeDiagnosticPdf({ outputPath, report }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 46, bottom: 52, left: 54, right: 54 },
      bufferPages: true,
      info: { Title: "OBD Diagnostic Report", Author: "OBD Diagnostic Service" }
    });
    for (const [name, fontPath] of Object.entries(pdfFonts)) doc.registerFont(name, fontPath);
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    addHeader(doc, report);
    sectionTitle(doc, "Customer information");
    addField(doc, "Car ID", String(report.carId));
    addField(doc, "Name", report.name, report.language);
    addField(doc, "Phone", report.phone, report.language);
    addField(doc, "Customer amount", Number(report.amount).toFixed(2), report.language);
    addField(doc, "Explanation language", report.language, report.language);
    sectionTitle(doc, "Diagnostic findings");

    for (const item of report.codes) {
      const codeHeight = 24;
      const charsPerLine = /[\u0900-\u097F]/u.test(item.meaning) ? 58 : 82;
      const estimatedLines = item.meaning.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
      const textHeight = Math.max(18, estimatedLines * 15);
      const needed = codeHeight + textHeight + 28;
      if (doc.y + needed > doc.page.height - 70) {
        doc.addPage();
        doc.y = 54;
        sectionTitle(doc, "Diagnostic findings continued");
      }
      doc.roundedRect(54, doc.y, 487, 25, 5).fill("#eef4f8");
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#12304a")
        .text(item.code, 66, doc.y + 6);
      doc.y += 34;
      const meaningY = doc.y;
      const rightToLeft = ["Arabic", "Urdu", "Persian", "Pashto"].includes(report.language);
      addMultilingualText(doc, item.meaning, 54, meaningY, {
        width: 475, fontSize: 10.5, lineGap: 4, color: "#263446", align: rightToLeft ? "right" : "left"
      });
      doc.y = Math.max(doc.y, meaningY + textHeight) + 20;
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let page = 0; page < pageCount; page += 1) {
      doc.switchToPage(page);
      doc.font("Helvetica").fontSize(8).fillColor("#6b7785")
        .text(
          "General code information only. Confirm diagnosis using vehicle-specific service information.",
          54,
          doc.page.height - 38,
          { width: 487, align: "center", lineBreak: false }
        );
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
  });
}



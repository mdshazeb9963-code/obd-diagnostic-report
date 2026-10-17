import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(__dirname, "../node_modules/@fontsource/noto-sans-devanagari/files");
const latinFont = path.join(fontDirectory, "noto-sans-devanagari-latin-400-normal.woff");
const devanagariFont = path.join(fontDirectory, "noto-sans-devanagari-devanagari-400-normal.woff");

function addMultilingualText(doc, value, x, y, options = {}) {
  const text = String(value);
  const chunks = text.match(/[\u0900-\u097F]+|[^\u0900-\u097F]+/gu) || [text];
  chunks.forEach((chunk, index) => {
    const fontPath = /[\u0900-\u097F]/u.test(chunk) ? "NotoDevanagari" : "NotoLatin";
    doc.font(fontPath).fontSize(options.fontSize || 11).fillColor(options.color || "#17212f");
    doc.text(chunk, index === 0 ? x : undefined, index === 0 ? y : undefined, {
      width: options.width,
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

function addField(doc, label, value) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#526071")
    .text(label.toUpperCase(), 54, y, { width: 125, lineBreak: false });
  addMultilingualText(doc, value, 180, y, { width: 360, fontSize: 11 });
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
    doc.registerFont("NotoLatin", latinFont);
    doc.registerFont("NotoDevanagari", devanagariFont);
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    addHeader(doc, report);
    sectionTitle(doc, "Customer information");
    addField(doc, "Car ID", String(report.carId));
    addField(doc, "Name", report.name);
    addField(doc, "Phone", report.phone);
    addField(doc, "Customer amount", Number(report.amount).toFixed(2));
    addField(doc, "Explanation language", report.language);
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
      addMultilingualText(doc, item.meaning, 54, meaningY, { width: 475, fontSize: 10.5, lineGap: 4, color: "#263446" });
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



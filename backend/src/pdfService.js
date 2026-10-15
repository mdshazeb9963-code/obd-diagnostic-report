import fs from "node:fs";
import PDFDocument from "pdfkit";

function addHeader(doc, report) {
  doc.rect(0, 0, doc.page.width, 112).fill("#12304a");
  doc.font("Helvetica-Bold").fontSize(21).fillColor("#ffffff")
    .text("OBD Diagnostic Report", 54, 35);
  doc.font("Helvetica").fontSize(10).fillColor("#d9e7f2")
    .text(`Customer ID ${report.customerId}  ·  ${report.createdAt}`, 54, 72);
  doc.y = 142;
}

function addField(doc, label, value) {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#526071")
    .text(label.toUpperCase(), 54, y, { width: 125, lineBreak: false });
  doc.font("Helvetica").fontSize(11).fillColor("#17212f");
  const valueHeight = doc.heightOfString(value, { width: 360 });
  doc.text(value, 180, y, { width: 360 });
  doc.y = y + Math.max(12, valueHeight) + 12;
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
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    addHeader(doc, report);
    sectionTitle(doc, "Customer information");
    addField(doc, "Customer ID", String(report.customerId));
    addField(doc, "Name", report.name);
    addField(doc, "Phone", report.phone);
    sectionTitle(doc, "Diagnostic findings");

    for (const item of report.codes) {
      const codeHeight = 24;
      const textHeight = doc.heightOfString(item.meaning, { width: 475, lineGap: 4 });
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
      doc.font("Helvetica").fontSize(10.5).fillColor("#263446")
        .text(item.meaning, 54, doc.y, { width: 475, lineGap: 4 });
      doc.y += textHeight + 20;
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



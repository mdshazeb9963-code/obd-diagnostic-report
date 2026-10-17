import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { z } from "zod";
import { createIdStore } from "./idStore.js";
import { explainCodes, extractCodesFromAttachment, lookupObdMeaning } from "./obdService.js";
import { writeDiagnosticPdf } from "./pdfService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "../data"));
const reportsDir = path.join(dataDir, "reports");
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
await fs.mkdir(reportsDir, { recursive: true });
const idStore = createIdStore(dataDir);
const app = express();
const analysisCache = new Map();

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // The single-file local preview includes inline styles and its small UI script.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", frontendOrigin],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    const devOrigin = process.env.NODE_ENV !== "production" && origin === "null";
    if (!origin || origin === frontendOrigin || devOrigin || origin === `http://localhost:${port}`) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  }
}));
app.use(express.json({ limit: "30kb" }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

const acceptedExtensions = /\.(txt|csv|log|pdf|png|jpe?g|webp)$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1 },
  fileFilter(_req, file, callback) {
    if (!acceptedExtensions.test(file.originalname)) {
      return callback(new Error("Upload a TXT, CSV, LOG, PDF, PNG, JPG, or WEBP file."));
    }
    callback(null, true);
  }
});

const codeSchema = z.string().trim().regex(/^[PBCU][0-3][0-9A-F]{3}$/i);
const languageSchema = z.string().trim().min(2).max(40)
  .regex(/^[\p{L}\p{M}\s().'-]+$/u, "Enter a language name, such as Hindi or Hinglish.");
const reportSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(30),
  amount: z.number().finite().min(0).max(1_000_000_000).default(0),
  language: languageSchema.default("English"),
  analysisId: z.string().uuid().optional(),
  codes: z.array(codeSchema).min(1).max(25).optional()
}).refine((body) => body.analysisId || body.codes?.length, {
  message: "An analyzed file or at least one valid code is required."
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/analyze-file", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose a diagnostic file." });
    const parsedLanguage = languageSchema.safeParse(req.body?.language || "English");
    if (!parsedLanguage.success) {
      return res.status(400).json({ error: "Choose a valid explanation language." });
    }
    const codes = await extractCodesFromAttachment(req.file);
    if (!codes.length) {
      return res.json({ fileName: req.file.originalname, language: parsedLanguage.data, codes: [] });
    }
    const findings = await explainCodes(codes, parsedLanguage.data);
    const now = Date.now();
    for (const [id, entry] of analysisCache) {
      if (now - entry.createdAt > 30 * 60 * 1000) analysisCache.delete(id);
    }
    while (analysisCache.size >= 500) analysisCache.delete(analysisCache.keys().next().value);
    const analysisId = crypto.randomUUID();
    analysisCache.set(analysisId, { language: parsedLanguage.data, findings, createdAt: now });
    return res.json({ fileName: req.file.originalname, language: parsedLanguage.data, analysisId, codes: findings });
  } catch (error) {
    next(error);
  }
});

app.post("/api/obd/lookup", async (req, res, next) => {
  try {
    const parsed = codeSchema.safeParse(req.body?.code);
    if (!parsed.success) {
      return res.status(400).json({ error: "Enter a valid 5-character OBD-II code, such as P0300." });
    }
    const meaning = await lookupObdMeaning(parsed.data.toUpperCase());
    return res.json({ code: parsed.data.toUpperCase(), meaning });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports", async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Enter customer name, phone, and at least one valid code." });
    }
    const { name, phone, amount, language, analysisId } = parsed.data;
    let findings;
    if (analysisId) {
      const cached = analysisCache.get(analysisId);
      if (!cached || Date.now() - cached.createdAt > 30 * 60 * 1000) {
        analysisCache.delete(analysisId);
        return res.status(410).json({ error: "This analysis expired. Analyze the file again before adding the car." });
      }
      if (cached.language !== language) {
        return res.status(400).json({ error: "The selected language changed. Analyze the file again." });
      }
      findings = cached.findings;
    } else {
      const codes = [...new Set(parsed.data.codes.map((code) => code.toUpperCase()))];
      findings = await explainCodes(codes, language);
    }
    const carId = await idStore.nextId();
    const createdAt = new Intl.DateTimeFormat("en", {
      dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
    }).format(new Date());
    const fileName = `report-${carId}-${crypto.randomUUID()}.pdf`;
    const outputPath = path.join(reportsDir, fileName);

    await writeDiagnosticPdf({
      outputPath,
      report: { carId, name, phone, amount, language, codes: findings, createdAt }
    });
    if (analysisId) analysisCache.delete(analysisId);

    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`)
      .replace(/\/$/, "");
    return res.status(201).json({
      carId,
      customerId: carId,
      downloadUrl: `${baseUrl}/reports/${encodeURIComponent(fileName)}`
    });
  } catch (error) {
    next(error);
  }
});

app.get("/reports/:fileName", async (req, res, next) => {
  try {
    if (!/^report-\d+-[0-9a-f-]+\.pdf$/i.test(req.params.fileName)) {
      return res.status(404).json({ error: "Report not found." });
    }
    const reportPath = path.join(reportsDir, req.params.fileName);
    await fs.access(reportPath);
    return res.download(reportPath, "OBD-Diagnostic-Report.pdf");
  } catch (error) {
    next(error);
  }
});

// Serve the interactive preview from the same origin as the API for local use.
app.get("/", async (_req, res) => {
  const previewPath = path.resolve(__dirname, "../../obd-report-preview.html");
  try {
    await fs.access(previewPath);
    return res.sendFile(previewPath);
  } catch {
    return res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OBD Diagnostic Report</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f4f7fb; color: #12304a; }
      main { max-width: 820px; margin: 4rem auto; padding: 2rem; background: white; border-radius: 16px; box-shadow: 0 12px 30px rgba(18, 48, 74, 0.1); }
      h1 { margin-top: 0; }
      code { background: #eef4f8; padding: 0.2rem 0.4rem; border-radius: 6px; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>OBD Diagnostic Report</h1>
      <p>The local preview page could not be found at the default path, but the API is running normally.</p>
      <p>Use the backend endpoints directly or add a preview file called <code>obd-report-preview.html</code> in the project root to restore the browser UI.</p>
    </main>
  </body>
</html>`);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "File must be 10 MB or smaller." : "Invalid file upload."
    });
  }
  if (error.message === "Origin is not allowed by CORS.") {
    return res.status(403).json({ error: "This website is not allowed to use the API." });
  }
  if (error.message === "OBD lookup service is not configured.") {
    return res.status(503).json({
      error: "Add your Gemini API key to the backend .env file and restart the server."
    });
  }
  if (error.publicMessage) {
    return res.status(error.statusCode || 502).json({ error: error.publicMessage });
  }
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error("Request failed:", error.message);
  return res.status(status).json({
    error: status < 500 ? error.message : "The diagnostic service could not complete the request. Check the server configuration and try again."
  });
});

const server = app.listen(port, () => {
  console.log(`OBD report backend running at http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

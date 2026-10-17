# OBD Diagnostic Report backend

## Requirements

- Node.js 20 or newer
- A Gemini API key with access to the Gemini API

## Setup

```powershell
cd backend
Copy-Item .env.example .env
# Add your GEMINI_API_KEY to .env, then:
npm install
npm start
```

Open <http://localhost:4000>. The server also exposes `GET /api/health`.

The backend defaults to `gemini-3.6-flash` and retries temporary service errors. The upload endpoint accepts TXT, CSV, and LOG files (code extraction runs locally), plus PDF, PNG, JPG, and WEBP scans (Gemini reads the attachment). The selected language is sent to the Gemini lookup service so both the code breakdown and its explanation use that language. The PDF report contains customer name, phone, amount, language, findings, and Car ID.

## Endpoints

- `POST /api/analyze-file` — multipart form with `file` and optional `language`; returns extracted codes with explanations.
- `POST /api/obd/lookup` — JSON `{ "code": "P0300" }`; returns an English explanation.
- `POST /api/reports` — JSON `{ "name": "...", "phone": "...", "amount": 2500, "language": "Hindi", "codes": ["P0300"] }`; performs server-side lookups, allocates a Car ID, writes the PDF, and returns `carId` and `downloadUrl`.
- `GET /reports/:fileName` — downloads a generated PDF.

## Car ID persistence and deployment

The persistent counter is stored in `DATA_DIR/report-counter.json`; generated PDFs are stored in `DATA_DIR/reports`. The first allocated ID is **101**. Requests are serialized within this Node process; for multiple server instances, use an atomic shared database sequence. Configure `FRONTEND_ORIGIN`, `PUBLIC_BASE_URL`, `GEMINI_MODEL`, and secrets as environment variables on the host. Keep `.env` and customer reports out of version control.

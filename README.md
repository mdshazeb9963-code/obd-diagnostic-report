# OBD Diagnostic Report

This repo contains a workshop OBD assistant: upload diagnostic files, detect and explain codes in a chosen language, listen to findings, and download a customer report PDF.

## Run locally

1. Install Node.js 20 or newer.
2. In the `backend` folder, copy `.env.example` to `.env` and add your own `GEMINI_API_KEY`.
3. Run `npm install` and `npm start` in `backend`.
4. Open <http://localhost:4000>.

New cars receive sequential IDs starting at **101**. The counter persists in `backend/data/report-counter.json`. Customer reports are generated as PDFs in `backend/data/reports`.

Never commit `.env` or customer reports. GitHub hosts this source repository; the Express API needs a Node.js host to run as a public website.

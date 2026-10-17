# OBD Diagnostic Report

This repo contains the Smart Library OBD assistant. The page follows a two-column workshop layout with drag-and-drop upload, customer name, Pass / Phone, amount in INR, and a live OBD report card. Upload a scan to find and explain each code in the selected language, listen to findings, and download a customer PDF.

## Run locally

1. Install Node.js 20 or newer.
2. In the `backend` folder, copy `.env.example` to `.env` and add your own `GEMINI_API_KEY`.
3. Run `npm install` and `npm start` in `backend`.
4. Open <http://localhost:4000>.

New cars receive sequential IDs starting at **101**. The counter persists in `backend/data/report-counter.json`; `GET /api/next-car-id` returns the next available ID for the page. Customer reports are generated as PDFs in `backend/data/reports`.

Never commit `.env` or customer reports. GitHub hosts this source repository; the Express API needs a Node.js host to run as a public website.

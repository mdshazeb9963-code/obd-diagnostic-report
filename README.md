# OBD Diagnostic Report

A small full-stack application that reads a diagnostic file, extracts OBD-II trouble codes, looks up explanations through Google Gemini, and creates a downloadable PDF report with an automatically incrementing customer ID.

## Run locally

1. Install Node.js 20 or newer.
2. In `backend`, copy `.env.example` to `.env` and add your own `GEMINI_API_KEY`.
3. Run `npm install` and then `npm start` in `backend`.
4. Open <http://localhost:4000>.

The app accepts TXT, CSV, LOG, PDF, PNG, JPG, and WEBP diagnostic files. It can read codes from the uploaded file, explain them, speak the results using browser speech, and generate a PDF report. IDs persist in `backend/data/report-counter.json`.

## Hosting

This repository hosts the source code. GitHub Pages cannot run the Express API or protect a Gemini API key. To make the complete app available online, deploy the Express backend to a Node.js host, set `GEMINI_API_KEY` and `NODE_ENV=production` as environment variables there, and point the frontend/API configuration to that backend. Never commit `.env` or generated customer reports.

# Mini ATS – Applicant Tracking System

A lightweight ATS to manage **candidates**, **hiring stages**, **search/filter**, and **dashboard metrics**.

**Live app:** `<paste deployed URL>`  **Repo:** `<paste GitHub URL>`  **Demo video:** `docs/demo.webm` (or your hosted link)

## Features
- **Candidate management** – add, edit, delete; fields: name, email (unique), phone, position, skills, experience, source, rating (0–5).
- **Hiring stages** – Applied → Screening → Interview → Offer → Hired / Rejected. Move via drag-and-drop Kanban board or the detail view; every change is logged in a stage-history timeline.
- **Search & filter** – full-text search (name, email, position, skills), filter by stage / position / source / min experience, sortable columns.
- **Dashboard metrics** – total, active, hired, rejected, new in 7 days, hire rate, avg days-to-hire, avg experience, stage distribution, hiring funnel, breakdown by position & source, recent applicants.
- **Notes** per candidate, input validation, duplicate-email protection, responsive UI with dark-mode support.

## Tech stack
Node.js + Express, SQLite (Node built-in `node:sqlite`, no native deps; needs Node ≥ 22.13), vanilla JS/HTML/CSS frontend (no build step), `node:test` for tests.

## Run locally
```bash
npm install
npm start          # http://localhost:3000  (seeds 28 demo candidates on first run)
npm test           # API tests
SEED=false npm start   # start with an empty database
```
Env vars: `PORT`, `DB_PATH` (SQLite file), `SEED`.

## API
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/candidates?q=&stage=&position=&source=&min_exp=&sort=&order=&page=&limit=` | List / search / filter |
| POST | `/api/candidates` | Create |
| GET | `/api/candidates/:id` | Detail with history + notes |
| PATCH | `/api/candidates/:id` | Update fields and/or stage |
| DELETE | `/api/candidates/:id` | Delete |
| POST | `/api/candidates/:id/notes` · DELETE `/api/notes/:id` | Notes |
| GET | `/api/dashboard` | Metrics |
| GET | `/api/stages`, `/api/facets`, `/health` | Helpers |

## Deploy
**Render (free):** push to GitHub → New → Blueprint → select repo (`render.yaml` is included). Note: free-tier disk is ephemeral, so data resets on redeploy; the app re-seeds demo data automatically. For persistence, attach a disk and set `DB_PATH=/data/ats.db`.

**Docker:** `docker build -t mini-ats . && docker run -p 3000:3000 -v ats-data:/data mini-ats`

**Publish to GitHub:**
```bash
git init && git add . && git commit -m "Mini ATS" && git branch -M main
git remote add origin https://github.com/<you>/mini-ats.git && git push -u origin main
```

## Structure
```
src/ (app.js API · db.js schema · seed.js · server.js)   public/ (SPA)   test/   docs/ (screenshots, demo)
```

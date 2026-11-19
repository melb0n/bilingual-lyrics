# Bilingual Lyrics

A private tool for turning worship songs into bilingual ProPresenter slides
(English on top, Spanish below — or your choice).

## What works now
- **Team password** sign-in (shared by the worship team)
- **New song:** paste lyrics or a chord chart; chords are stripped and sections
  (Verse, Chorus, Coro, Puente…) are detected; choose lines per slide
- **AI translation** of the missing language, one section at a time, then
  side-by-side editing with per-slide and per-section re-translate
- **Slide preview** and **style** settings (font, size, color, which language on top)
- **Printable bilingual lyric sheet** (Print / Save as PDF)
- **Song library** with search, stored in Netlify Blobs

## Coming next
- Upload an existing `.pro` file
- Download as ProPresenter 7 `.pro` (needs sample `.pro` files to match the format)

## Deploying on Netlify
1. In Netlify: **Add new site → Import an existing project → GitHub** and pick this repo.
   Build settings are read from `netlify.toml`.
2. In **Site configuration → Environment variables**, add:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `TEAM_PASSWORD` — the password your team will use to sign in
   - `ANTHROPIC_MODEL` *(optional)* — defaults to `claude-opus-5-5`
3. Trigger a deploy. Netlify Blobs needs no setup.

## Local development
```
npm install
TEAM_PASSWORD=dev ANTHROPIC_API_KEY=sk-... npm run dev
```
Locally, songs are saved in `.data/` instead of Netlify Blobs.

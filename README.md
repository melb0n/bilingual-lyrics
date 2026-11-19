# Bilingual Lyrics

A private tool for turning worship songs into bilingual ProPresenter slides
(English on top, Spanish below — or your choice).

## What works now
- **Team password** sign-in (shared by the worship team)
- **New song:** paste lyrics or a chord chart; chords are stripped and sections
  (Verse, Chorus, Coro, Puente…) are detected; choose lines per slide
- **Full-song editor** (default): the whole song in each language side by side (ChordPro or plain),
  lined up automatically by section and line, with mismatch warnings, "lock chords" to copy chords
  from one language to the other, slide breaks every N lines, transpose, scroll sync, and undo
- **Find official translation**: before machine-translating, the AI searches the web for an official or
  widely sung version in the other language and shows its title, artist and links (it does not copy the
  lyrics). New songs search first and only machine-translate if nothing is found. Requires web search
  to be enabled for the Anthropic account.
- **Paste both languages at once** when creating a song, or let the AI translate the missing one
- **Slide-by-slide view** with per-slide and per-section re-translate
- **Slide preview** and **style** settings (font, size, color, which language on top)
- **Printable bilingual lyric sheet** (Print / Save as PDF)
- **Song library** with search, stored in Netlify Blobs
- **Upload a `.pro` file** (English-only, Spanish-only, or bilingual; the site works out which box is which language)
- **ChordPro**: paste or upload `.cho`/`.chordpro`/`.txt` charts (ChordPro tags, inline `[G]` chords,
  or chords written above the lyrics). Chords are kept for musicians, never projected. The AI places
  chords on translated lines too. Edit chords with "Show chords" in the editor.
- **Chord sheet** printout (chords above English and Spanish) and **ChordPro export** (English, Spanish, or both)
- **Download as ProPresenter 7 `.pro`** in the "Como Dijiste - Bilingual" layout: two text boxes,
  section groups with colors and hot keys. Chords are written as ProPresenter chord attributes for the stage
  display (experimental: not yet verified against a ProPresenter file that has chords)

## About the .pro format
ProPresenter 7 files are Google Protocol Buffers. The schema in `src/lib/pro/schema.json` is generated from the
unofficial, reverse-engineered definitions at github.com/greyshirtguy/ProPresenter7-Proto (MIT, see
`src/lib/pro/PROTO_LICENSE`). The slide layout in `src/lib/pro/template.json` comes from a file saved by
ProPresenter 18.4. Always open exported files in ProPresenter and check them before a service.

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

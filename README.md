# Bilingual Lyrics

A private tool for turning worship songs into bilingual ProPresenter 7 slides
(English on top, Spanish below — or your choice).

## Planned features
- Input: paste lyrics / chord charts, upload `.pro` files, search the song library
- AI drafts the missing language; review side by side and fix lines before export
- Export: ProPresenter 7 `.pro`, printable bilingual lyric sheet
- Custom styling (fonts, colors, which language on top)
- Song library stored in Netlify Blobs
- Simple shared team password

## Hosting
Deployed on Netlify. Required environment variables are listed in `.env.example`.

## Local development
```
npm install
npm run dev
```

# Bilingual Lyrics

A private web app for a church worship team that turns songs into **bilingual ProPresenter 7 slides**
(for example English on top, Spanish below), with chords for the band, Planning Center integration,
and sign-in with Planning Center accounts.

This guide is written so another church can set up its own copy from scratch.

---

## What it does

**Songs**
- Create a song by pasting lyrics, a chord chart (chords above lyrics), or ChordPro, or by uploading a
  ProPresenter `.pro` or ChordPro file. Title, artist, key, BPM and time signature are read from
  ChordPro tags automatically.
- Paste both languages at once, or type the translation in yourself (translation is a manual step; the
  app never machine-translates). **"Find official translation"** can search the web for a published
  translation of the song (it shows links; it never copies lyrics).
- **Full-song editor**: each language side by side, lined up by section and line, with warnings when
  line counts don't match, "lock chords" to copy chords onto the other language, slide breaks every N
  lines, transpose, and undo. A slide-by-slide view is also available.
- **Chords**: add from a pasted/uploaded chart, or "Find & add chords automatically" (AI reads a public
  chart page and places its chords on your lines; your words are never changed).
- **Repeated parts**: sections that repeat word for word (Coro, Puente…) can be combined so each is
  stored, edited and translated once, with a **song order** (editable). The `.pro` gets each group
  once plus a ProPresenter arrangement; Planning Center gets the sequence; print shows the order.
- **Song library** with cards or a details table, search, filters and sorting.

**Output**
- **Download `.pro`** for ProPresenter 7: two named text boxes ("Main Language" / "Second Language"),
  section groups with colors and hot keys, the song key, and chords stored the way ProPresenter shows
  them on a stage display.
- **ProPresenter theme download** matching the site's style (Style panel).
- **Printable lyric sheet and chord sheet** (Print / Save as PDF).

**Planning Center**
- **Sign in with Planning Center**; only people in your church's Planning Center organization get in.
- **Roles**: Admin (people and settings), Editor (songs, AI tools, Planning Center), Viewer (view,
  print, download). Managed on the **Team** page.
- **Send to Planning Center**: creates/updates a "Bilingual" arrangement with the chord chart, key,
  BPM and time signature, and attaches the `.pro` and PDF sheets.
- **Import from Planning Center** (many songs at once) and **Update from Planning Center** for a
  linked song (shows a preview of the changes before applying).

---

## What you need

| Account | What for | Cost |
|---|---|---|
| **GitHub** | Holds your copy of the code | Free |
| **Netlify** | Hosts the site and stores songs (Netlify Blobs) | Free plan is usually enough |
| **Planning Center** (an organization admin) | Sign-in, roles, send/import songs | Free API |
| **Anthropic** *or* **Google Gemini** | Official-translation search, chord search (optional) | Anthropic: pay as you go (roughly cents per song). Gemini: free tier available |
| **ProPresenter 7** | Opening the `.pro` files | — |

---

## Setup (about 30–45 minutes)

### 1. Get your own copy of the code
This repository is private. Ask its owner for access or a copy, then put it in **your own GitHub
account** (for example: create an empty private repository and push this code to it). Each church
should run its **own** copy, with its own Netlify site and keys.

### 2. Create the Netlify site
1. In Netlify: **Add new site → Import an existing project → GitHub**, and pick your repository.
   Build settings come from `netlify.toml`; don't change them.
2. Note your site address, e.g. `https://your-church-lyrics.netlify.app` (you can rename the site in
   **Site configuration → Site details → Change site name**, or add a custom domain).
3. The first deploy may show "Sign-in isn't set up" until the variables below are added. That's expected.

### 3. Set up the AI provider (choose one)

**Anthropic (default)**
1. At **console.anthropic.com**: create an account, add a payment method and **buy credits** under
   **Billing** (requests are refused with a billing error until there is a balance).
2. Under **Limits**, make sure the monthly spend limit isn't $0.
3. In the organization's settings, **enable web search and web fetch** (used by "Find official
   translation" and the chord tools).
4. **API Keys → Create Key → "Continue with an API key"** (identity federation doesn't work on Netlify).
   Copy the key (starts with `sk-ant-`).

**Google Gemini (alternative)**
1. At **aistudio.google.com/apikey**, create an API key.
2. You'll set `AI_PROVIDER=gemini` and `GEMINI_API_KEY` below.
3. On Gemini's free tier, Google may use requests to improve its products; check their terms.

### 4. Set up Planning Center
Do this as a **Planning Center organization administrator**, at
**api.planningcenteronline.com/oauth/applications**.

**a) OAuth application (for "Sign in with Planning Center")**
1. Click **New Application** (under *OAuth applications*).
2. Fill in:
   - **Application name**: e.g. `Bilingual Lyrics`
   - **Application type**: `Confidential`
   - **Application description** (required): e.g. *Lets our worship team sign in to our bilingual
     lyrics site with their Planning Center accounts.*
   - **URL**: your site's home page, e.g. `https://your-church-lyrics.netlify.app`
   - **Authorization callback URLs**: your site address + `/api/auth/callback`, e.g.
     `https://your-church-lyrics.netlify.app/api/auth/callback` (exactly, https, no trailing slash).
     Add one line per address if you also use a custom domain.
   - Leave **Versions** at their defaults.
3. Save, then copy the **Client ID** and **Secret**.

**b) Personal Access Token (for sending and importing songs)**
1. On the same page, under **Personal Access Tokens**, click **New Personal Access Token**.
2. Copy the **Application ID** and **Secret** (the secret may only be shown once).
3. Songs are sent to Planning Center **as the person who created this token**, so that person needs
   **Editor** (or higher) permission for Services songs.

With this token set, the site also learns your organization automatically. (Without it, you must set
`PCO_ORGANIZATION_ID` yourself.)

### 5. Add the environment variables in Netlify
**Site configuration → Environment variables → Add a variable** (scope: all / Functions, Production).
Never put keys in chat, email or the code.

| Variable | Required? | Value |
|---|---|---|
| `SITE_URL` | **Yes** | Your public site address, e.g. `https://your-church-lyrics.netlify.app` (no trailing slash) |
| `PCO_OAUTH_CLIENT_ID` | **Yes** (turns on Planning Center sign-in) | Client ID from step 4a |
| `PCO_OAUTH_CLIENT_SECRET` | **Yes** | Secret from step 4a |
| `SESSION_SECRET` | **Yes** | Any long random text (40+ characters); signs login sessions |
| `PCO_APP_ID` | Recommended | Application ID from step 4b (Send/Import, and finds your organization) |
| `PCO_SECRET` | Recommended | Secret from step 4b |
| `PCO_ORGANIZATION_ID` | Only without `PCO_APP_ID`/`PCO_SECRET` | Your Planning Center organization ID |
| `ANTHROPIC_API_KEY` | If using Anthropic | Key from step 3 (`sk-ant-…`) |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-opus-5-5` (e.g. `claude-sonnet-5-5` costs less) |
| `AI_PROVIDER` | Only for Gemini | `gemini` |
| `GEMINI_API_KEY` | If using Gemini | Key from step 3 |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-3.8-flash` |
| `TEAM_PASSWORD` | Optional / temporary | A shared password, used **only** while the `PCO_OAUTH_*` variables are not set (everyone is Admin). Remove it once Planning Center sign-in works. |

> **Netlify AI Gateway:** Netlify may inject its own `ANTHROPIC_BASE_URL`/key so AI calls use Netlify
> credits. This app ignores the gateway and always calls Anthropic directly with **your**
> `ANTHROPIC_API_KEY`, so make sure that variable holds your own key.

Then **Deploys → Trigger deploy → Deploy site** (environment changes only apply after a deploy).

### 6. First sign-in and your team
1. Open your site and click **Sign in with Planning Center**. **The first person to sign in becomes
   Admin**, so the person setting it up should do this right away.
2. Open **Team** (top bar). Under *Give someone a role by email*, enter each person's **Planning Center
   email** and choose **Editor** or **Viewer**; they get that role at their first sign-in. Anyone not
   listed starts as **Viewer**. Make a second trusted person **Admin** too.
3. Share the site address with the team.
4. Optional checks (Admin only): **`/api/ai-status`** shows which AI provider is active and whether its
   key works.

### 7. Set up ProPresenter
1. **Theme (optional):** in a song's **Style** panel, set the look you want (or click *Use bold all-caps
   preset*), then **Download ProPresenter theme with this style**. Unzip it into ProPresenter's
   **Themes** folder and restart ProPresenter.
2. **Songs:** use **Download .pro** and import the file. **Don't apply a theme to songs that have
   chords**: applying a theme in ProPresenter appears to remove chords. Songs already come out styled.
3. **Stage display with chords:** in ProPresenter's **Stage** editor, select the *Current Slide* text
   object, turn on **Chords** (Text tab), and under **Linked Text** choose *Current Slide* →
   **Element Matching Name** with `Main Language` (or `Second Language`) to show just one language.
   Do the same for *Next Slide*. Which language box carries chords is set in the Style panel.
4. Always check a new song in ProPresenter before a service.

### 8. Make it yours (optional)
- **Default slide look:** `DEFAULT_STYLE` in `src/lib/types.ts`; the preset is `VB_THEME_STYLE` there.
- **Slide layout** (box positions, fonts): `src/lib/pro/template.json`, taken from a real ProPresenter
  file. Box positions are `topBounds` / `bottomBounds` (1920×1080).
- **Languages:** the app is built for English ⇄ Spanish (`LANG_NAMES` in `src/lib/types.ts`, the
  language detection in `src/lib/lang.ts`).

---

## Costs
- **No AI cost:** editing, chords you paste, transpose, printing, PDFs, `.pro` downloads, sign-in, Team,
  Send / Import / Update with Planning Center.
- **AI cost** (Anthropic or Gemini), only when used: "Find official translation", "Find chord charts" and
  "Find & add chords automatically" (each section reads the chart page again). Translating is manual and
  costs nothing.
- **Netlify:** page and function requests count toward Netlify's plan allowance; normal use is small.

---

## Troubleshooting

| Message / symptom | Cause and fix |
|---|---|
| Planning Center: *"The requested redirect URI is malformed or doesn't match"* | The callback address must be in **Authorization callback URLs** (not *URL*) and match exactly. Set `SITE_URL`, redeploy, and compare with the address under **"Setting this up?"** on the sign-in page. |
| *"The site doesn't know your church's Planning Center account yet"* | Set `PCO_APP_ID`/`PCO_SECRET` (step 4b) or `PCO_ORGANIZATION_ID`, then redeploy. |
| *"That Planning Center account isn't part of this church"* | The person signed in with a Planning Center account from a different organization. |
| *"usage_exceeded"* | Usually Netlify credits used up (often by its AI Gateway). Check Netlify → Usage & billing; make sure `ANTHROPIC_API_KEY` is your own key. |
| *"Anthropic billing: … credit balance …"* | Add credits / raise the spend limit in the Anthropic Console. |
| *"ANTHROPIC_API_KEY is missing or invalid"* | Set your own key in Netlify and redeploy. `/api/ai-status` shows whether it works. |
| *"Web search/fetch isn't enabled"* | Enable web search and web fetch in the Anthropic Console (organization settings). |
| *"Planning Center isn't connected"* (Send / Import) | Set `PCO_APP_ID` and `PCO_SECRET`, redeploy. |
| Chords disappear in ProPresenter after applying a theme | Don't apply themes to chorded songs; download them already styled. |
| A page or sign-in times out | Retry; if it persists, an Admin can open `/api/auth/diagnose` (storage timings) and check Netlify **Logs → Functions**. |

---

## Technical notes (for whoever maintains it)
- **Stack:** Next.js (App Router) on Netlify; songs and users in **Netlify Blobs** (`songs`, `users`
  stores). Reading a key that doesn't exist can hang in Netlify's runtime, so `src/lib/store.ts` checks
  existence with an exact-prefix `list` first.
- **Auth:** Planning Center OAuth (`src/app/api/auth/*`), HMAC-signed session cookie
  (`src/lib/session.ts`), roles checked on every API route (`src/lib/authz.ts`). The whole team is one
  record (`users/team`).
- **`.pro` format:** ProPresenter 7 files are Protocol Buffers. `src/lib/pro/schema.json` is generated from
  the unofficial definitions at github.com/greyshirtguy/ProPresenter7-Proto (MIT, see
  `src/lib/pro/PROTO_LICENSE`). Chord ranges, chord-only lines and the song key follow the spec and test
  data of github.com/greyshirtguy/pro7chordeditorwin.
- **AI:** `src/lib/anthropic.ts` (always `api.anthropic.com`), `src/lib/gemini.ts`, web tools in
  `src/lib/webSearch.ts`. Returned lines are checked word for word before they're used.

### Local development
```
npm install
TEAM_PASSWORD=dev ANTHROPIC_API_KEY=sk-ant-... npm run dev
```
Without `PCO_OAUTH_*` variables the app uses the team password. Locally, data is saved in `.data/`
instead of Netlify Blobs.

---

## License
MIT License, © 2026 Iglesia Manantial De Vida. See [`LICENSE`](LICENSE). You may use, change and share
this software, including for other churches, as long as the copyright notice and license text stay
with it. It comes with no warranty.

The ProPresenter file-format definitions in `src/lib/pro/schema.json` come from
github.com/greyshirtguy/ProPresenter7-Proto and keep their own MIT license
(`src/lib/pro/PROTO_LICENSE`).

# The Anti™ Radio — technical README

**Who this is for:** this document is written for whoever picks up maintenance
on this project next — a human developer, or another AI assistant in a future
session that doesn't have the conversation history where this was built. It
assumes no prior context. If you're Claude (or another model) reading this
cold: read this whole file before touching code. It'll save you from re-deriving
decisions that were already made deliberately.

**What this is:** a single-file, no-build, no-backend PWA that streams
**The Complete Discography of Mauro Fuentes** directly from a Google Drive
folder. There is no database. The Drive folder *is* the database. Everything —
catalog structure, cover art, videos, lyrics — is read live from Drive via the
Drive API v3 with a restricted, client-side API key.

Covers five projects: **Antelia, ARIA, Arken, Manto, Mauro Fuentes.**

---

## Files in this repo

- `index.html` — the entire app. HTML + CSS + JS in one file, no imports, no
  build step, no npm. This is intentional — it needs to be droppable straight
  onto GitHub Pages with zero tooling.
- `sw.js` — service worker, caches the app shell for PWA installability.
  **Bump the `CACHE` version string every time you edit `index.html` or `sw.js`
  itself**, or returning visitors get stuck on a stale cached version. This has
  bitten us repeatedly during development — it's not optional housekeeping.
- `manifest.json` — PWA manifest (name, icons, theme color).
- `icon-192.png`, `icon-512.png` — app icons (halo/ring motif).

---

## Architecture, in one paragraph

On load, the app calls `getCatalog()`, which either returns a `localStorage`-cached
catalog (1 hour TTL) or calls `buildCatalog()`, which walks the Drive folder
tree (project → category → release → tracks) using the Drive API, in parallel
with a concurrency limiter (`mapLimit`), and returns a plain JS object (`CATALOG`).
Everything else — rendering, playback, the chronological "reel", lyrics, videos
— reads from that one in-memory object and a single `state` object. There is no
framework, no virtual DOM, no reactivity system: rendering is just functions
that clear a container and rebuild its innerHTML/children from `CATALOG` + `state`.

---

## Code map — where things live

Read top to bottom, this is roughly the order things appear in `index.html`:

| Concern | Key functions/constants |
|---|---|
| Config | `API_KEY`, `ROOT_FOLDER_ID`, `CACHE_KEY`, `CACHE_TTL_MS` |
| Drive I/O | `driveList()`, `driveImg()`, `driveAudio()`, `mapLimit()` |
| Cover art selection | `pickCoverImage()`, `buildCoverSet()` |
| Video parsing | `parseVideoText()`, `fetchVideoMap()`, `attachVideos()`, `youtubeEmbedUrl()` |
| Lyrics parsing | `parseLyricsText()`, `fetchLyricsMap()`, `attachLyrics()`, `formatLyricsText()`, `escapeHtml()` |
| Catalog construction | `buildAlbum()` (single release + multi-disc), `buildCatalog()` |
| Category ordering | `CATEGORY_PRIORITY`, `sortedCategoryKeys()` |
| App state | the single `state` object (see below) |
| Rendering | `renderProjects()`, `renderProjectInfo()`, `renderCategories()`, `renderMain()`, `renderAlbumView()` |
| Project blurbs | `PROJECT_INFO` (hardcoded English text per project) |
| Image lightbox | `openLightbox()` / `lightboxPrevImg()` / `lightboxNextImg()` |
| Video lightbox | `openVideoLightbox()` / `videoLightboxPrevVid()` / `videoLightboxNextVid()` |
| Lyrics viewer | `openLyrics()`, cylinder-style scroll (`lyricsTick()`, pointer handlers) |
| Player core | `loadAndPlay()`, `goToPrevTrack()`, `goToNextTrack()`, seek bar pointer handlers |
| Playback resilience | `audio.addEventListener('error', ...)` — surfaces a message and auto-advances instead of failing silently |
| Next-track prefetch | `prefetchNextTrack()`, `prefetchedTrack` |
| Media Session (lock screen) | `updateMediaSession()`, the `if ('mediaSession' in navigator)` block |
| Shareable release links | `buildShareUrl()`, `shareRelease()`, `findReleaseFromParams()` |
| Full timeline reel | `buildReelEntries()`, `renderReel()`, hover/drag physics, `playChronoFromReel()`, `advanceChrono()`, `retreatChrono()` |

---

## The `state` object

One global mutable object drives everything the user is currently looking at
or listening to:

```js
state = {
  project, category, album,       // what's currently being browsed
  discIndex,                      // which disc of a multi-disc release is shown
  sortDesc,                       // catalog sort direction (newest/oldest)
  queue, qIndex,                  // the actual playback queue + position in it
  currentAlbumTitle,              // display label shown in the player
  chronoMode, chronoIndex, chronoStep  // "Spin the Cylinder" continuous-playback state
}
```

`chronoMode` is the important one to understand: it's `true` only when playback
was started from the reel ("Spin the Cylinder"), and it changes what happens
when a queue runs out — normal playback loops the same release forever;
chrono mode advances to the next release in the full timeline instead (see
"Known limits" for the one real gap here).

---

## Drive folder structure & naming rules

```
Root folder
 |- Project (Antelia, Arken, ARIA, Mauro Fuentes, Manto)
     |- Category (The Albums, The Singles, The Extended, The Lives...)
         |- Release -> "[2026.04.01] Abstract"
             |- Cover Art/          <- images + optional VID + optional LYR
             |   |- Abstract (art by Mauro Fuentes).png
             |   |- VID
             |   |- LYR
             |- 01. Primores.mp3
             |- 02. Hoy.mp3
             |- ...
```

**Naming that matters:**
- Releases: `[YYYY.MM.DD] Title` — the date drives sorting; parsed in
  `parseAlbumName()`.
- Tracks: `NN. Track Title.mp3` — the number drives ordering; the title
  (without number or extension) is the matching key used by videos and lyrics.
- Categories are auto-ordered via `CATEGORY_PRIORITY`: **Albums → Extended →
  Singles → Lives → Collabs → Specials**. Anything not in that list is pushed
  to the end; nothing breaks if a new category name shows up.

**Multi-disc / multi-part releases:** if a release folder has *no* mp3s
directly inside it but has subfolders instead (e.g. `se7en I`, `se7en II`,
`se7en III`), `buildAlbum()` treats each subfolder as its own "disc" in a
carousel (`album.discs[]`), each with its own cover, video map, and lyrics map.

**Cover art priority** (`pickCoverImage()`): a file with **"(art by ...)"** in
the name wins as the main cover; failing that, "front"/"cover"/"folder" in the
name; "back"/"booklet"/"inside"/"photo shoot" etc. are actively deprioritized.
Everything else is still browsable in the lightbox gallery, just not as the
default thumbnail.

---

## Adding videos (VID files)

Drop a plain text file named exactly **VID** (no extension) inside a release's
`Cover Art` folder. Blocks are separated by a blank line: first line is a track
title (or the keyword `RELEASE` for a full-release video), followed by one or
more YouTube links.

```
RELEASE
https://youtu.be/xxxxxxxxxxx

01. Destruyan Nuestras Almas
https://youtu.be/aaaaaaaaaaa
https://youtu.be/bbbbbbbbbbb
```

- `RELEASE` links a video to the whole release — the play button appears next
  to the release/disc subtitle, not in the track list.
- Any other header is matched against a track's title (`attachVideos()`,
  case-insensitive; a leading track number or trailing `.mp3` is stripped
  automatically, so pasting the exact filename works fine).
- Multiple links under one header become arrow-navigable in the video lightbox.
- Opening any video auto-pauses the main player; resuming continues from the
  same position (we never reset `currentTime` on pause, so this is free).
- **Note the blank-line-separated format here is different from LYR below** —
  don't confuse the two when editing either file.

## Adding lyrics (LYR files)

Drop a plain text file named exactly **LYR** inside the same `Cover Art`
folder. Unlike VID, blank lines are **not** a separator here — they're
preserved as real line breaks (stanza breaks), because lyrics need those.
Instead, a new song starts only when a line begins with a track number
(`parseLyricsText()` looks for `^\d+\.`):

```
01. Destruyan Nuestras Almas.mp3
Destruyan Nuestras Almas

estoy llegando hasta el final
reptando por tu piel

no te puedes escapar de mí
soy la sangre de tu corazón

02. Fuera de la Colmena
...
```

- The line right after the header, if it exactly repeats the track title, is
  auto-skipped (so pasting "01. Title.mp3" followed by a plain "Title" line,
  like Anti's actual files do, doesn't leak into the displayed lyrics).
- Formatting: `*text*` renders **bold**, `_text_` renders *italic* — both can
  span multiple lines (a whole stanza can be wrapped). This is handled by
  `formatLyricsText()`, which escapes HTML first, so raw `<`/`>`/`&` in lyrics
  are safe.
- The lyrics viewer uses the same "Spin the Cylinder" scroll physics (hover
  near top/bottom edges to auto-scroll at variable speed on desktop, drag on
  mobile) instead of a native scrollbar — see the reel section in the code map.
- No LYR file, or a title that doesn't match anything → no lyrics button
  appears for that track. Nothing breaks either way.

---

## Setup

### 1 — Get a Google Drive API key (one-time)

1. console.cloud.google.com, with the account that owns the Drive folder.
2. Create a project.
3. **APIs & Services → Library** → search "Google Drive API" → **Enable**.
4. **APIs & Services → Credentials → Create Credentials → API Key**.
5. Restrict it:
   - **Application restrictions** → "Websites" → add `your-username.github.io/*`
     (and `localhost/*` for local testing).
   - **API restrictions** → "Restrict key" → check only **Google Drive API**.
6. Copy the key (`AIza...`).

### 2 — Configure

Near the top of the `<script>` in `index.html`:

```js
const API_KEY = 'YOUR_KEY_HERE';
const ROOT_FOLDER_ID = 'YOUR_ROOT_FOLDER_ID';
```

### 3 — Deploy to GitHub Pages

Upload all five files to the repo root → **Settings → Pages** → Branch `main`,
folder `/ (root)` → Save. If a deploy fails in the **Actions** tab with a
generic error, it's usually a GitHub hiccup, not the code — hit **Re-run jobs**
before troubleshooting anything further.

---

## Caching — two separate layers, don't confuse them

1. **Catalog cache** (`localStorage`, key `CACHE_KEY`, `CACHE_TTL_MS` = 1 hour):
   avoids re-walking all of Drive on every page load. The **Retune** button
   forces `getCatalog(true)`, bypassing this. **If you ever change the shape
   of the data `buildAlbum()`/`buildCatalog()` return, bump `CACHE_KEY`** so
   visitors with an old cached shape don't hit `undefined` errors on fields
   that didn't exist yet in their cached copy.
2. **App shell cache** (`sw.js`, the `CACHE` constant): caches `index.html` +
   `manifest.json` for offline/installed use. **Bump this on every deploy.**
   This is the one that has actually caused "I uploaded the fix but nothing
   changed" confusion multiple times during development — it's a service
   worker holding onto the old file, not a Drive/GitHub problem.

---

## Known limits (read before assuming something's a bug)

- **Audio streaming** goes through the Drive API's `alt=media` endpoint with
  the API key. Fine for low/moderate traffic; Google can throttle a single
  file if hit unusually hard in a short window. Long-term fix if this becomes
  real would be a proper CDN (Cloudflare R2, Backblaze B2) — the Drive/API-key
  setup was never built for viral-scale traffic, and everyone involved knows that.
- **Multi-disc + chronological playback**: if "Spin the Cylinder" crosses from
  disc I into disc II of a multi-disc release, audio correctly moves forward,
  but the on-screen disc picker doesn't auto-switch to show disc II — the
  now-playing highlight can go quiet until the user manually picks that disc.
  Single-disc releases don't have this issue. Not fixed yet; would need
  `state.discIndex` to track the flattened chrono queue position across disc
  boundaries, which the current `getAllTracksForItem()` flattening doesn't
  preserve enough info to do cleanly.
- **Next-track prefetch only covers same-queue transitions** (`prefetchNextTrack()`
  only looks at `state.queue[state.qIndex + 1]`). It does **not** prefetch across
  a "Spin the Cylinder" release boundary (i.e. the jump `advanceChrono()` makes).
  That jump still does a fresh network fetch with no pre-buffering.
- **Mobile background playback is improved, not guaranteed.** Media Session
  API + prefetching next tracks measurably helps Android hold onto playback
  through a locked screen, but Chrome's background-tab freezing and
  per-manufacturer battery optimization (MIUI, Samsung, etc.) can still kill
  it after enough time backgrounded — this is an OS-level policy, not
  something fixable purely from a browser tab's JS. If it recurs, the next
  real lever is installing as a PWA (Add to Home Screen) rather than running
  in a normal browser tab, and/or the user disabling battery optimization for
  the browser app in their phone's settings. Neither of those is something
  the code can force.
- **Large catalogs**: `buildCatalog()` walks every folder live, in parallel
  batches (`mapLimit`), on every cache-miss load. Fine at current scale;
  if this ever grows into the hundreds of releases, a periodically
  pre-generated catalog JSON (built by a script, not walked live per visitor)
  would load faster than live-walking Drive.
- **A track failing to load** (Drive throttling, a revoked/misconfigured key,
  a genuinely broken file) used to just go silent with no explanation. Fixed:
  the `audio` element's `error` event now shows a brief inline message and
  auto-advances to the next track (or the next release, if in chrono mode)
  after ~1.2s, instead of stalling playback with no feedback.

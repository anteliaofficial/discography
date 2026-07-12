# The Anti™ Radio

A live-streaming PWA for **The Complete Discography of Mauro Fuentes** — reads
directly from Google Drive, no database, no backend. Upload a file to Drive,
it shows up in the app. That's the whole idea.

Covers five projects: **Antelia, ARIA, Arken, Manto, Mauro Fuentes.**

---

## What's actually in here

- **Live catalog** — reads your Drive folder structure on load, no manual data entry.
- **Multi-disc carousel** — albums with multiple "discs" (subfolders) show a
  picker; the active one is playable, others are just a tap away.
- **Cover art gallery** — if a "Cover Art" folder has more than one image, they're
  all browsable inside the lightbox with prev/next arrows.
- **YouTube videos per track or per release** — see "Adding videos" below.
- **"Spin the Cylinder"** — a full chronological timeline of every release across
  every project, scrollable like a slot-machine reel (hover speed on desktop,
  drag on mobile), with continuous "never stop the party" playback that bounces
  ping-pong style between your oldest and newest release.
- **Project info blurbs** — a short description under each project tab, clamped
  to 4 lines with a "Read more" toggle.
- **Seekable player** — drag the progress bar, see elapsed/total time, loop the
  current release, chronological mode respects prev/next too.
- **Installable PWA** — "Add to Home Screen" on mobile, works like a native app shell.

---

## Setup

### 1 — Get a Google Drive API key (one-time)

1. Go to console.cloud.google.com with the account that owns the Drive folder.
2. Create a project (e.g. "Antelia Web").
3. **APIs & Services -> Library** -> search "Google Drive API" -> **Enable**.
4. **APIs & Services -> Credentials -> Create Credentials -> API Key**.
5. Click the new key to restrict it:
   - **Application restrictions** -> "Websites" -> add `your-username.github.io/*`
     (and `localhost/*` if testing locally first).
   - **API restrictions** -> "Restrict key" -> check only **Google Drive API**.
6. Copy the key (starts with `AIza...`).

### 2 — Paste it into the code

Open `index.html`, find this near the top of the `<script>`:

```js
const API_KEY = 'YOUR_KEY_HERE';
const ROOT_FOLDER_ID = 'YOUR_ROOT_FOLDER_ID';
```

Replace with your real key and the Drive folder ID of your root discography folder.

### 3 — Deploy to GitHub Pages

Upload `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`
to the root of your repo -> **Settings -> Pages** -> Branch `main`, folder `/ (root)`
-> Save. Live in a minute or two at `your-username.github.io/repo-name/`.

If a deploy fails in the **Actions** tab with a generic error, it's usually a
GitHub hiccup, not your code — hit **Re-run jobs** before troubleshooting anything.

---

## Drive folder structure & naming rules

```
Root folder
 |- Project (Antelia, Arken, ARIA, Mauro Fuentes, Manto)
     |- Category (The Albums, The Singles, The Extended, The Lives...)
         |- Release -> "[2026.04.01] Abstract"
             |- Cover Art/          <- images + optional VID file
             |   |- Abstract (art by Mauro Fuentes).png
             |   |- VID
             |- 01. Primores.mp3
             |- 02. Hoy.mp3
             |- ...
```

**Naming that matters:**
- Releases: `[YYYY.MM.DD] Title` — the date is parsed and used for sorting/display.
- Tracks: `NN. Track Title.mp3` — the number drives ordering; the title (without
  number or extension) is what's shown and what video-matching uses.
- Categories are auto-ordered as **Albums -> Extended -> Singles -> Lives ->
  Collabs -> Specials**, whichever exist for that project; unrecognized category
  names just get pushed to the end, nothing breaks.

**Multi-disc / multi-part releases:** if a release folder has *no* mp3s directly
inside it but has subfolders instead (e.g. `se7en I`, `se7en II`, `se7en III`),
each subfolder becomes its own "disc" in a carousel, each with its own cover
and its own optional `Cover Art` + `VID` file.

**Cover art priority:** if a `Cover Art` folder has multiple images, the one
with **"(art by ...)"** in the filename wins as the main cover; failing that,
anything with "front", "cover", or "folder" in the name; anything with "back",
"booklet", "inside", "photo shoot" etc. is deprioritized. Everything else stays
browsable in the gallery, just not as the default thumbnail.

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

- `RELEASE` links a video to the whole release — the play button appears right
  next to the release/disc subtitle.
- Any other header is matched against a track's title (case-insensitive; a
  leading track number or trailing `.mp3` in the header is ignored automatically,
  so you can paste the exact filename if that's easier).
- Multiple links under the same header become arrow-navigable in the video
  lightbox (e.g. official video + making-of).
- Opening any video automatically pauses whatever's playing in the main player;
  resuming playback afterward continues from the same spot, it doesn't restart.
- No VID file, or a title that doesn't match anything -> no play button appears.
  Nothing breaks either way.

---

## Caching

The catalog is cached in the visitor's browser (`localStorage`) for **1 hour**
so we're not hammering the Drive API on every page load. Hit **Retune** (top
right) to force a fresh pull immediately. If you ever change the shape of the
data the app expects, bump `CACHE_KEY` in the code so old cached visitors don't
choke on a stale format.

The service worker (`sw.js`) also caches the app shell itself. **Every time you
change `index.html` or `sw.js`, bump the `CACHE` version string inside `sw.js`**
— otherwise returning visitors can get stuck on an old version indefinitely.
If something you just changed doesn't seem to show up, this is almost always why.

---

## Known limits

- **Audio streaming** goes through the Drive API's `alt=media` endpoint using
  the API key. Works well for low/moderate traffic; Google can throttle a
  single file if it's hit unusually hard in a short window. If this becomes a
  real problem, moving audio to a proper CDN (Cloudflare R2, Backblaze B2) is
  the long-term fix — the API key/Drive setup is not built for viral-scale traffic.
- **Multi-disc + chronological playback**: if "Spin the Cylinder" is playing
  through a multi-disc release and crosses from disc I into disc II, the audio
  correctly moves forward, but the on-screen disc picker doesn't auto-switch to
  show disc II — the now-playing highlight can go quiet until you manually pick
  that disc. Single-disc releases don't have this issue.
- **Large catalogs**: the app walks every folder live on load (in parallel,
  rate-limited, but still real network calls). Fine for a catalog this size;
  if it ever grows into the hundreds of releases, a periodically pre-generated
  catalog JSON would load faster than walking Drive on every visit.

# The Anti™ Radio — technical README

**Who this is for:** this document is written for whoever picks up maintenance
on this project next — a human developer, or another AI assistant in a future
session that doesn't have the conversation history where this was built. It
assumes no prior context. If you're Claude (or another model) reading this
cold: read this whole file before touching code. It'll save you from re-deriving
decisions that were already made deliberately, and from "fixing" things that
are actually intentional (see **Brand & scope**, first thing below — it exists
because a past session almost flagged an intentional design choice as a bug).

**What this is:** a single-file, no-build, no-backend PWA that streams
**The Complete Discography of Mauro Fuentes** directly from a Google Drive
folder. There is no database. The Drive folder *is* the database. Everything —
catalog structure, cover art, videos, lyrics — is read live from Drive via the
Drive API v3 with a restricted, client-side API key.

Covers five projects: **Antelia, ARIA, Arken, Manto, Mauro Fuentes.**

---

## Brand & scope — read this before touching the header or subtitle

**The Antelia™ Experience** is the artist's community and umbrella brand —
it encompasses his entire musical career as a whole, not one project among
the five. **The Anti™ Radio** (this app) exists *for* The Antelia™ Experience
specifically, and for nothing else: it is not a neutral, per-project player
that happens to also host Antelia — it is Antelia's own listening app, and
Antelia, ARIA, Arken, Manto, and Mauro Fuentes are the catalog it plays.

This is why `<p id="subtitle">The Antelia™ Experience</p>` in the header is
**hardcoded and intentionally never changes** when the user switches projects
in the nav. It is not wired to `applyProjectAtmosphere()` or any other
project-switching logic, and it should stay that way — it's not a missed
feature, it's not dead markup, it's the one piece of chrome that names *whose*
app this is, independent of which project's catalog is currently on screen.
If a future edit is tempted to make the subtitle read "The ARIA Experience"
when ARIA is selected, or similar — don't. That would misrepresent the brand
structure: ARIA is a project *within* The Antelia™ Experience, not a peer
brand the app also serves.

---

## Files in this repo

- `index.html` — the entire app. HTML + CSS + JS in one file, no imports, no
  build step, no npm. This is intentional — it needs to be droppable straight
  onto GitHub Pages with zero tooling. Includes the **Atmosphere** background
  system, the **catalog search**, and the **custom cursor** — each documented
  in its own section below.
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
Everything else — rendering, playback, the chronological "reel", catalog search,
lyrics, videos — reads from that one in-memory object and a single `state`
object. There is no framework, no virtual DOM, no reactivity system: rendering
is just functions that clear a container and rebuild its innerHTML/children
from `CATALOG` + `state`.

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
| Catalog search | `buildSearchIndex()`, `searchCatalog()`, `renderSearchDropdown()`, `highlightMatch()`, `stripAccents()`/`normSearch()` — see dedicated section below |
| Image lightbox | `openLightbox()` / `lightboxPrevImg()` / `lightboxNextImg()` |
| Video lightbox | `openVideoLightbox()` / `videoLightboxPrevVid()` / `videoLightboxNextVid()` |
| Lyrics viewer | `openLyrics()`, cylinder-style scroll (`lyricsTick()`, pointer handlers) |
| Player core | `loadAndPlay()`, `goToPrevTrack()`, `goToNextTrack()`, seek bar pointer handlers |
| Playback resilience | `audio.addEventListener('error', ...)` — surfaces a message and auto-advances instead of failing silently |
| Next-track prefetch | `prefetchNextTrack()`, `prefetchedTrack` |
| Media Session (lock screen) | `updateMediaSession()`, the `if ('mediaSession' in navigator)` block |
| Shareable release links | `buildShareUrl()`, `shareRelease()`, `findReleaseFromParams()` |
| Full timeline reel | `buildReelEntries()`, `renderReel()`, hover/drag physics, `playChronoFromReel()`, `advanceChrono()`, `retreatChrono()` |
| Atmosphere (background identity) | `applyProjectAtmosphere()`, `PROJECT_BG_CLASS` — see dedicated section below |
| Custom cursor | isolated IIFE at the very end of the file — see dedicated section below |

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
"Known limits" for the one real gap here). Note that opening a release from
**catalog search** sets `state.album` the same way the grid cards do — it does
**not** set `chronoMode`, so searching and opening a release behaves like a
normal grid click, not like starting from the reel.

---

## Catalog search

**What it is:** a search box in the header, immediately left of **Retune**,
that matches across the *entire* catalog — every project, every category —
not just whatever's currently on screen. Typing shows a dropdown of matches
sorted newest → oldest, since seeing every match across the whole catalog is
the priority, not narrowing by project first.

**What it matches**, all accent-insensitive (`normSearch()`/`stripAccents()`
— "cancion" matches "canción"):
- Release/single title
- Track title (inside multi-track albums and multi-disc releases)
- Project name (e.g. typing "ARIA" surfaces every ARIA release)
- Category name (e.g. "Singles")
- Date/year, partial or full (`2021`, `2021.05`, `2021.05.03`)

**No result cap.** Every match is reachable — the dropdown doesn't truncate
to a fixed number. Instead it uses the exact same hover-edge "cylinder" scroll
mechanic as the Reel (`.search-viewport` / `.search-track`, the pointer-zone
speed logic mirrors `reelViewport`'s): hover near the top or bottom edge of
the dropdown to glide through results, faster the closer to the edge; drag to
scroll on touch. This was a deliberate consistency choice — the site already
had one "hover to scroll a list of releases" pattern (the Reel), so search
reuses it instead of introducing a second, different scroll idiom.

**Highlighting:** the matched substring renders inside `<mark>` (styled via
CSS, not a native highlight) in both the title and the project/date subline,
so it's clear *why* a result matched, especially for date-based searches.

**Keyboard:** `↑`/`↓` moves the active row (auto-scrolling it into view if it's
outside the visible band), `Enter` opens the active row (or the first result
if none is active yet), `Esc` closes the dropdown. Click-outside also closes it.

**Known limitation worth knowing about:** `searchCatalog()` calls
`buildSearchIndex()` on every keystroke, which walks the entire `CATALOG`
object fresh each time. At current catalog size this is unmeasurable, but if
the catalog grows into the hundreds of releases, building the flat index once
(on catalog load/refresh) and reusing it across keystrokes would be the
obvious next optimization — nothing about the index depends on the query
string, only on `CATALOG` itself.

---

## Custom cursor

**What it is:** a small circular dot (`#custom-cursor`) that replaces the
native cursor on desktop/mouse (`@media (hover: hover) and (pointer: fine)`;
untouched on touch devices, where it's hidden entirely). It uses
`mix-blend-mode:difference` against whatever's underneath, so it reads white
on dark backgrounds and black on light ones automatically, with no per-element
color logic needed.

**How the motion works:** the dot doesn't snap to the real pointer position —
it eases toward it every frame (`pos.x += (tgt.x - pos.x) * 0.75`, same for
`y`). That `0.75` is the one number to tune if this ever feels off: closer to
`1` = the dot sticks almost exactly to the real cursor (minimal glide);
closer to `0` = a longer, more visible lag. `0.75` was landed on deliberately
after two rounds of tuning — an earlier `0.18` felt sluggish and tedious, `0.45`
still had a faint but noticeable delay, `0.75` is the current "barely-there,
pleasant" glide. If it's ever adjusted again, that's the only line to change.

**Hover state:** growing from `10px` to `18px` (`s = hovering ? 18 : 10`) with
a `.15s` CSS transition on `width`/`height`/`opacity`, whenever the pointer is
over anything in the `hovering` selector list inside the IIFE. **That selector
list is the one place you must remember to update by hand** if you add a new
clickable component to the site — it isn't automatic, it doesn't infer
"clickable" from `cursor:pointer` or event listeners, it's a hardcoded
`.closest('...')` call. As of this cleanup it lists real, currently-existing
classes only (`.card`, `.disc-card`, `.halo-ring`, `.video-btn`, `.lyrics-btn`,
`.share-btn`, `.reel-row`, `.reel-direction-btn`, `.search-result`,
`.lightbox-nav`, plus bare `button`/`a`) — a previous version of this list
still referenced `.chip`, `.nav-arrow`, and `[onclick]`, none of which exist
in the current markup (see **Code cleanup log** below); those were removed.

**This is isolated on purpose:** the cursor script is its own IIFE at the very
bottom of the file, touching no shared state, no `CATALOG`, no `state` object.
It's the safest thing in the whole file to experiment with, because nothing
else depends on it and it depends on nothing else — the only coupling is that
hardcoded selector list.

---

## Code cleanup log

This section exists so a future session doesn't waste time re-discovering
things already checked. As of this pass, the following dead/redundant code
was found and removed — all four were verified as **genuinely unused** (via
grep across the whole file, not assumption) before deletion:

1. **`.atmo-line-draw` + `@keyframes atmoDraw`** — defined in CSS with a
   comment claiming it was "used for Manto's diagram connectors," but no SVG
   element anywhere in the markup ever carried that class. Leftover from an
   earlier iteration of the Manto layer that was replaced by the `.atmo-mark`
   opacity-fade approach that's actually in use. Removed, including its entry
   in the `prefers-reduced-motion` selector list.
2. **Duplicate `.share-btn:hover` rule** — two adjacent, identically-scoped
   rules where the second only overrode `color`, leaving `border-color` from
   the first to survive by accident rather than by design. Merged into one
   rule with both properties explicit.
3. **`const projectInfo = document.getElementById('projectInfo');`** —
   declared once, never read again anywhere in the file. Removed. (The actual
   `<div id="projectInfo">` element in the HTML is untouched and still used —
   just not through this particular unused variable.)
4. **Ghost selectors in the cursor's hover-detection list** — `.chip`,
   `.nav-arrow`, and the attribute selector `[onclick]` matched nothing in the
   current markup (no element uses the `onclick="..."` HTML attribute; all
   handlers are assigned via the `.onclick =` JS property, which doesn't
   satisfy that CSS attribute selector). Removed, and `.search-result` was
   added in their place since it's a real, currently-missing case — search
   result rows are clickable but weren't triggering the cursor's hover-grow
   state before this pass.

If you're an AI assistant auditing this file again later: the check that
found all four was mechanical, not eyeballing — grep every class/id/function
name across the full file and flag anything with a reference count of exactly
one (only its own definition). That's a cheap, reliable first pass before
trusting any "this looks unused" instinct.

---

## Atmosphere — the per-project background identity system

**What it is:** a purely visual, purely CSS+SVG layer that gives each of the
five projects its own ambient background, entirely decoupled from data,
playback, and rendering logic. It lives inside `index.html` only (no separate
file) — the `<style>` block (search for `Atmosphere —`) and the
`<div id="atmosphere">` markup right after `<body>`.

**How it's wired to the rest of the app (and why you almost never need to
touch JS for this):** `applyProjectAtmosphere()` is the *only* JS function
that touches Atmosphere, and all it does is swap one class on `#atmosphere`:

```js
const PROJECT_BG_CLASS = { 'Antelia': 'proj-antelia', 'ARIA': 'proj-aria', 'Arken': 'proj-arken', 'Manto': 'proj-manto', 'Mauro Fuentes': 'proj-mauro' };
```

Every visual difference between projects — glow color, which SVG layer is
visible, line color, animation timing — is driven purely by CSS selectors
scoped under `.atmosphere.proj-X`. If you're adding a sixth project, the JS
change is one new entry in `PROJECT_BG_CLASS`; the visual work is 100% CSS/SVG.

There's one small deliberate exception, unrelated to per-project switching:
a scroll-parallax effect (search `--sy`) reads scroll position and nudges the
ambient glow blobs via a CSS custom property. That's the one place JS reaches
into Atmosphere's styling, and it's project-agnostic.

### Structure

Two layers stack inside `#atmosphere` (`z-index:0`, fixed, behind the whole
`.app`, `pointer-events:none` throughout so it never intercepts taps):

1. **Ambient glow** (`.atmosphere::before` / `::after`) — two large, heavily
   blurred, softly drifting circles using `--atmo-1` / `--atmo-2`. These are
   CSS custom properties overridden per project (`.proj-antelia{ --atmo-1:...}`
   etc.) so the same two pseudo-elements repaint themselves on class swap —
   no separate glow markup per project. Deliberately near-monochrome for every
   project **except Antelia**, which is the one identity allowed to be
   multicolor (its rings carry the color; the glow underneath stays a dim
   magenta/purple wash so it doesn't fight the rings).
2. **Line-art layer** (`.atmo-layer`) — five `<div class="atmo-layer atmo-layer-X">`
   blocks, one per project, each wrapping one inline SVG (`viewBox="0 0 1000 1000"`,
   `preserveAspectRatio="xMidYMid slice"` so the composition crops gracefully
   at any aspect ratio instead of stretching). All five are always in the DOM;
   only the active one is visible — controlled entirely by opacity:

   ```css
   .atmosphere.proj-antelia .atmo-layer-antelia{ opacity:.62; }
   .atmosphere.proj-aria    .atmo-layer-aria{ opacity:.58; }
   /* ...one rule per project */
   ```

   This is why switching projects fades smoothly (`.atmo-layer` has
   `transition:opacity 1.6s ease`) instead of hard-cutting — all five SVGs are
   always rendered, just invisible.

### The shared visual grammar

Every project's line art follows the same rules, so a designer can tell they're
the same system even with color removed — only geometry, color, and symbolism
change per project:

- Stroke width ~0.5–0.7px, `fill:none` (no filled shapes, no illustrations).
- `vector-effect="non-scaling-stroke"` on every stroked element, so lines stay
  crisp and equally thin regardless of how the SVG is scaled to fill different
  screen sizes.
- `mix-blend-mode:screen` on `.atmo-layer` — lets the thin strokes glow subtly
  against the near-black background instead of sitting flat on top of it.
- One shared "breathing" keyframe family (`atmoBreathe21` / `24` / `25` / `28`
  / `30`) — a near-imperceptible scale pulse (≤1.8%), transform-origin at
  canvas center. The duration is the *one* place each project is allowed to
  diverge in pace, and it's tied to that project's symbolic number (Antelia 7
  → 21s, Aria 12 → 24s, Arken 5 → 25s, Manto 4 → 28s, Mauro Fuentes 1 → 30s —
  slower for the more minimal/sober identities).
- No fast motion anywhere. Movement is limited to: opacity breathing
  (`.atmo-mark`, `.atmo-dot`), and small horizontal drift (`.atmo-current`,
  Arken only). Nothing rotates quickly, nothing scales more than ~2%.
- `@media (prefers-reduced-motion: reduce)` kills every Atmosphere animation.

### Per-project identity

| Project | Symbolic number | Concept | Color | Geometry |
|---|---|---|---|---|
| **Antelia** | 7 | Resonance, spectrum, light | Full rainbow (only multicolor layer) | 7 offset rings, radius decreasing, one hue per ring |
| **Aria** | 12 | The sky, constellations (not galaxies/nebulae/planets) | Ice blue | 12 stars + 12 connecting edges, plus faint unconnected background stars |
| **Arken** | 5 | Deep ocean, bathymetric charts, currents (not waves/water literally) | Dark petroleum blue | 5 horizontal current lines, vertical spacing loosely following φ (golden ratio) |
| **Manto** | 4 | Creative laboratory / research notebook (not alchemy/esoterica) | Warm gray / tan | 4 diagram clusters: axis+circle, radius+arc, curve+guide line, node graph |
| **Mauro Fuentes** | 1 | The author, the origin, sobriety — an architectural plan | Neutral gray | Single central crosshair axis + minimal tick marks. The most minimal of all five, intentionally |

### Editing or adding to Atmosphere

- **To restyle one project:** find its `.atmo-layer-X` block in the HTML and
  its `--atmo-1`/`--atmo-2` override in the CSS. You never need to touch JS.
- **To retune shared behavior** (line weight, breathing amount, blend mode):
  edit the shared rules (`.atmo-layer`, `.atmo-breathe`, etc.) once — it
  applies to all five projects, keeping them visually consistent by
  construction rather than by convention.
- **To add a sixth project:** add one `.atmo-layer atmo-layer-newproj` SVG
  block, one opacity rule (`.atmosphere.proj-newproj .atmo-layer-newproj`),
  one `--atmo-1`/`--atmo-2` override, one entry in `PROJECT_BG_CLASS` (JS),
  and pick or reuse a breathing-duration class.
- **Whenever you edit this block, bump the `sw.js` `CACHE` version** — same
  rule as any other `index.html` change (see Caching section below);
  Atmosphere edits are easy to mistake for "just visual" and skip this step,
  but the app shell cache doesn't know the difference.

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
  (without number or extension) is the matching key used by videos and lyrics
  (and now also by catalog search).
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
  mobile) as the Reel and catalog search — see their sections above.
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
- **Catalog search rebuilds its flat index on every keystroke** (see the
  Catalog search section above) — a non-issue at current scale, worth
  memoizing if the catalog grows substantially.
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

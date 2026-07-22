# The Anti™ Radio — technical README

**Who this is for:** whoever picks up maintenance on this project next — a
human developer, or another AI assistant in a future session with no access
to the conversation history where this was built. It assumes no prior
context. If you're Claude (or another model) reading this cold: read this
whole file before touching code. It will save you from re-deriving decisions
that were already made deliberately, and from "fixing" things that are
actually intentional (see **Brand & scope**, immediately below — it exists
because a past session almost flagged an intentional design choice as a bug).

**What this is:** a single-file, no-build, no-backend PWA that streams
**The Complete Discography of Mauro Fuentes** directly from a Google Drive
folder. There is no database. The Drive folder *is* the database. Everything
— catalog structure, cover art, videos, lyrics — is read live from Drive via
the Drive API v3 with a restricted, client-side API key.

Covers five projects: **Antelia, ARIA, Arken, Manto, Mauro Fuentes.**

**Project status:** this codebase went through a full engineering audit (dead
code, duplication, performance, CSS, accessibility, PWA correctness — see
**Engineering audit log** near the end) and is considered stable. No new
features are planned for the moment; this document reflects the code exactly
as it stands, paused, until further notice.

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
Don't make the subtitle read "The ARIA Experience" when ARIA is selected, or
similar — that would misrepresent the brand structure: ARIA is a project
*within* The Antelia™ Experience, not a peer brand the app also serves.

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
- `manifest.json` — PWA manifest (identity, icons, theme color). See **PWA**
  below for what each field is doing and why.
- `icon-192.png`, `icon-512.png` — app icons (halo/ring motif). Verified at
  exactly 192×192 and 512×512px. Their background is the site's own
  `#0a0a0d`, and the ring artwork sits within a ~36%-of-size radius from
  center — inside Android's ~40% maskable safe zone — so `"purpose": "any
  maskable"` in the manifest is accurate: the ring survives being cropped
  into a circle, squircle, or any adaptive-icon shape without losing content.

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
| Drive I/O | `driveList()`, `driveImg()`, `driveAudio()`, `mapLimit()`, plus the file-type filters `isFolder()`, `isAudio()`, `isImage()` |
| Cover art selection | `pickCoverImage()`, `buildCoverSet()` |
| Video parsing | `parseVideoText()`, `fetchVideoMap()`, `attachVideos()`, `youtubeEmbedUrl()` |
| Lyrics parsing | `parseLyricsText()`, `fetchLyricsMap()`, `attachLyrics()`, `formatLyricsText()`, `escapeHtml()` |
| Catalog construction | `buildAlbum()` (single release + multi-disc), `buildCatalog()`, `parseAlbumName()`, `parseTrackName()` |
| Category ordering | `CATEGORY_PRIORITY`, `sortedCategoryKeys()` |
| App state | the single `state` object (see below) |
| Cached DOM refs | top-level `const`s for every element read more than once (`main`, `projectInfoText`, `atmosphereEl`, the player controls, etc.) — see **Performance notes** |
| Rendering | `renderProjects()`, `renderProjectInfo()`, `renderCategories()`, `renderMain()`, `renderAlbumView()`, `scrollToTopInstant()` |
| Project blurbs | `PROJECT_INFO` (hardcoded English text per project) |
| Catalog search | `buildSearchIndex()`/`getSearchIndex()`, `searchCatalog()`, `renderSearchDropdown()`, `highlightMatch()`, `stripAccents()`/`normSearch()` — see dedicated section below |
| Accessibility | delegated `role="button"` keydown handler, see dedicated section below |
| Image lightbox | `openLightbox()` / `lightboxPrevImg()` / `lightboxNextImg()` |
| Video lightbox | `openVideoLightbox()` / `videoLightboxPrevVid()` / `videoLightboxNextVid()` |
| Lyrics viewer | `openLyrics()`, cylinder-style scroll (`lyricsTick()`, pointer handlers) |
| Player core | `loadAndPlay()`, `goToPrevTrack()`, `goToNextTrack()`, seek bar pointer handlers |
| Playback resilience | `audio.addEventListener('error', ...)` — surfaces a message and auto-advances instead of failing silently |
| Next-track prefetch | `prefetchNextTrack()`, `prefetchedTrack`, `playingBlobUrl` — see **Player & playback mechanics**, the blob URL lifecycle matters here |
| Media Session (lock screen) | `updateMediaSession()`, the `if ('mediaSession' in navigator)` block |
| Shareable release links | `buildShareUrl()`, `shareRelease()`, `findReleaseFromParams()` |
| Full timeline reel | `buildReelEntries()`, `renderReel()`, hover/drag physics, `playChronoFromReel()`, `advanceChrono()`, `retreatChrono()` |
| Atmosphere (background identity) | `applyProjectAtmosphere()`, `PROJECT_BG_CLASS` — see dedicated section below |
| Custom cursor | isolated IIFE at the very end of the file — see dedicated section below |

**A note on functions not listed above:** this table lists the entry points
per feature, not every function in the file. Small companions follow two
predictable naming conventions and are intentionally left out of the table
because they're trivial to find once you know the pattern: `openX()` is
always paired with a `closeX()` right near it (lightboxes, lyrics), and
`xTick()` functions (`reelTick()`, `searchTick()`, `lyricsTick()`) are each a
`requestAnimationFrame` loop driving that one feature's own hover-scroll
physics — they never touch another feature's state.

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
**Known limits** for the one real gap here). Note that opening a release from
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

**The dropdown's height is dynamic, not fixed.** `renderSearchDropdown()`
sets `.search-viewport`'s height to `Math.min(results.length, maxVisibleRows)
* SEARCH_ROW_H` on every render — 1 result gets a one-row-tall dropdown, 5+
results get the capped height with internal scroll. `maxVisibleRows` itself
comes from `getSearchMaxVisibleRows()`, which returns 4 on narrow screens
(`matchMedia('(max-width: 600px)')`) and 5 otherwise — that asymmetry is
intentional, not a bug: mobile has less vertical room to spare. One structural
detail worth knowing if you touch this: `.search-track` is `position:absolute`
inside `.search-viewport`, so the viewport **must** get an explicit height
from JS on every single render (populated or empty) — an absolutely
positioned child contributes nothing to its static parent's height, so
without that explicit height the whole dropdown silently collapses to 0px.

**The index is memoized, not rebuilt per keystroke.** `buildSearchIndex()`
walks the whole `CATALOG` tree and flattens it into an array with every
field pre-normalized for accent-insensitive matching (`normTitle`,
`normProjectLabel`, etc. — computed once at index-build time, not
re-computed on every keystroke). `getSearchIndex()` caches that array in
`searchIndexCache` and only rebuilds it when `invalidateSearchIndex()` has
been called — which happens at both places `CATALOG` itself gets reassigned
(initial load and Retune). `searchCatalog()` always reads through
`getSearchIndex()`, never calls `buildSearchIndex()` directly. If you ever
add a new place that reassigns `CATALOG`, call `invalidateSearchIndex()`
there too, or search will keep matching against a stale snapshot.

**Highlighting:** the matched substring renders inside `<mark>` (styled via
CSS, not a native highlight) in both the title and the project/date subline,
so it's clear *why* a result matched, especially for date-based searches.

**Keyboard:** `↑`/`↓` moves the active row (auto-scrolling it into view if it's
outside the visible band), `Enter` opens the active row (or the first result
if none is active yet), `Esc` closes the dropdown. Click-outside also closes it.

---

## Custom cursor

**What it is:** a small circular dot (`#custom-cursor`) that replaces the
native cursor on desktop/mouse, and is fully absent — not just hidden, never
even initialized — on touch devices. It uses `mix-blend-mode:difference`
against whatever's underneath, so it reads white on dark backgrounds and
black on light ones automatically, with no per-element color logic needed.

**Mobile performance — this is load-bearing, read before changing anything
here:** the cursor's entire IIFE (event listeners *and* its
`requestAnimationFrame` loop) is gated behind one check at the very top:

```js
if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
```

This mirrors the CSS media query that already hides the cursor visually on
touch devices — but before this check existed, the JS ran anyway: an infinite
rAF loop doing per-frame interpolation math and repeatedly writing inline
styles to an element nobody could ever see, on every device, forever. That
was a real, measurable source of "the site feels heavier on mobile" — not
the interpolation math itself (trivially cheap), but a perpetual loop running
on hardware that would never render its result. If you ever need to debug
"why does the cursor feel different on my phone," the answer should be "it
doesn't run at all there," and if it's running, this guard is the first thing
to check.

**How the motion works:** the dot doesn't snap to the real pointer position
— it eases toward it every frame (`pos.x += (tgt.x - pos.x) * 0.90`, same for
`y`). That `0.90` is the one number to tune if this ever feels off: closer to
`1` = the dot sticks almost exactly to the real cursor (minimal glide); closer
to `0` = a longer, more visible lag. It went through three rounds of tuning —
`0.18` felt sluggish, `0.45` still had a faint delay, `0.75` was "barely-there,
pleasant" on desktop, and finally `0.90` for an even more immediate feel once
it became clear the *perceived* mobile sluggishness was actually the
always-running-loop issue above, not the interpolation constant. If it's ever
adjusted again, that's the only line to change; the mobile question is a
different line entirely (the `matchMedia` guard).

**Hover state:** growing from `10px` to `18px` (`s = hovering ? 18 : 10`) with
a `.15s` CSS transition on `width`/`height`/`opacity`, whenever the pointer is
over anything in the `hovering` selector list inside the IIFE. **That selector
list is the one place you must remember to update by hand** if you add a new
clickable component to the site — it isn't automatic, it doesn't infer
"clickable" from `cursor:pointer` or event listeners, it's a hardcoded
`.closest('...')` call. It currently lists: `.card`, `.disc-card`,
`.halo-ring`, `.video-btn`, `.lyrics-btn`, `.share-btn`, `.reel-row`,
`.reel-direction-btn`, `.search-result`, `.lightbox-nav`, plus bare `button`/`a`.

**This is isolated on purpose:** the cursor script is its own IIFE at the very
bottom of the file, touching no shared state, no `CATALOG`, no `state` object.
It's the safest thing in the whole file to experiment with, because nothing
else depends on it and it depends on nothing else — the only coupling is that
hardcoded selector list and the `matchMedia` guard above.

---

## Player & playback mechanics

**Loading a track** (`loadAndPlay()`) does several things every time: sets
`audio.src` (from a prefetched blob if one's ready, otherwise a fresh
`driveAudio()` URL), frees the *previous* blob URL if audio has genuinely
moved off it (see the blob lifecycle note below), resets every UI readout
(title, album label, `0:00/0:00`, seek bar, the halo ring's `--pct`), flips
the play/pause icon and its `aria-label`, highlights the row in the current
tracklist, updates the Media Session metadata, and kicks off prefetching the
*next* track. All from one function — there's no separate "reset UI" step to
remember to call elsewhere.

**Blob URL lifecycle — a real bug fixed here, understand this before touching
prefetch:** two different things share a similar shape and were previously
conflated into one variable. `prefetchedTrack` is *the next track's* pending
prefetch buffer; `playingBlobUrl` is *the blob URL `audio.src` is currently
using*. They are deliberately tracked separately now:

- `prefetchNextTrack()` only revokes `prefetchedTrack.blobUrl` if it is
  **not** the same URL as `playingBlobUrl` — i.e. only if that prefetch was
  never actually consumed into playback (the user skipped past it, or it's
  simply stale). If it *is* the currently-playing URL, it's left alone.
- `loadAndPlay()` is the only place that revokes `playingBlobUrl`, and only
  once it has already confirmed `audio.src` has moved on to something else.

**Why this matters, concretely:** before this split existed, the moment a
track started playing from a successful prefetch hit, `prefetchedTrack` and
`playingBlobUrl` were effectively the same object. As soon as the *next*
track's prefetch resolved (typically within a second or two — well before
the currently-playing track finishes), its success callback revoked
`prefetchedTrack.blobUrl` — which by then was the blob URL the **currently
playing** `<audio>` element's `src` was still pointing to. Revoking a blob
URL doesn't stop already-buffered audio from playing, but it does mean the
URL can no longer be re-resolved — so a later seek into a part of the file
the browser hadn't buffered yet could silently fail to load. This was a real,
latent correctness bug, not just a style nit.

**Seeking** (`seekFromEvent()`, wired to `seekBar`'s `pointerdown`/`pointermove`)
converts pointer X position into a percentage of `audio.duration` and sets
`audio.currentTime` directly. The visual seek bar is two overlapping
elements: `.progress-bar` is a fixed rainbow gradient spanning the full
width, and `.seek-remaining` is an opaque `var(--line)` block covering the
*unplayed* portion — so what looks like "the played portion lighting up in
color" is really "the future portion's mask shrinking away." The halo ring
around the play button uses the same `--pct` value in a `conic-gradient`, so
both indicators are driven by one number.

**Next-track prefetching**: fetches the next queued track's audio as a
`Blob` ahead of time so pressing next (or the track ending) can hand the
`<audio>` element an already-downloaded blob URL instead of waiting on a
fresh network request. **This only prefetches within the current queue** —
it does not know about `advanceChrono()`'s jump to a different release; see
Known Limits.

**Playback failure resilience**: the `audio` element's native `error` event
shows a brief inline message and auto-advances after ~1.2s — to the next
track normally, or via `advanceChrono()` if `state.chronoMode` is active.

**Media Session**: mirrors title/artist/album/artwork to the OS lock screen,
and wires the OS's previous/next/seek/play/pause controls to the exact same
functions the on-screen buttons call — no separate "lock screen" code path.

---

## Lightboxes (image, video, lyrics)

Three separate overlay elements — `#lightbox` (cover art gallery),
`#videoLightbox` (YouTube embed), `#lyricsLightbox` (scrollable lyrics) —
share one CSS toggle pattern (`.lightbox` / `.lightbox.visible`), but each
keeps its **own** state (`lightboxImages`/`lightboxIndex` for the gallery,
`lightboxVideos`/`videoLightboxIndex` for videos). Deliberate, not an
oversight: the three have different content types and different navigation
needs, so one generic "Lightbox" component would add abstraction without
sharing much real logic.

**Opening a video pauses the main player** (`openVideoLightbox()` calls
`audio.pause()`) — hearing the main playback and a YouTube video's audio at
once is exactly the clash worth preventing. Resuming continues from the same
position since `currentTime` is never reset on pause. **Opening lyrics does
*not* pause the player** — the point of the lyrics view is usually to read
along with the song while it keeps playing, so this asymmetry is intentional.

**Closing any lightbox does not auto-resume the main player** if it had been
paused — the user presses play again themselves. Current behavior, not a
"should probably auto-resume" gap.

**Keyboard nav** (arrow keys, `Escape`) is wired per lightbox via
`document`-level `keydown` listeners, each guarded by checking that *its own*
lightbox currently has the `.visible` class.

---

## Shareable release links

**Why the URL uses labels, not IDs** (`buildShareUrl()`): a shared link looks
like `?project=ARIA&category=Singles&date=2021.05.03` — human-readable labels
and the release's own date string, not database primary keys. Direct
consequence of the core architecture principle at the top of this document:
**the Drive folder *is* the database**, so there's no ID system to link
against beyond the labels and dates the catalog is already organized by.

`shareRelease()` tries `navigator.share()` first (native OS share sheet,
mainly mobile); falls back to `navigator.clipboard.writeText()` with a
"Copied!" label swap on the Share button for 1.5s.

**On load**, the startup IIFE checks `location.search` for
`project`/`category`/`date` and calls `findReleaseFromParams()` before the
normal "start at the first project" default — this is why a shared link
opens directly into that release instead of the catalog root.

**Known edge case:** `findReleaseFromParams()` matches the *first* item in a
category whose date matches exactly. Nothing currently enforces that two
releases in the same project+category can't share the exact same
`[YYYY.MM.DD]`; if that ever happened, a shared link would silently resolve
to whichever one Drive's listing returns first.

---

## Scroll behavior — always land at the top when opening a release

`scrollToTopInstant()` (`window.scrollTo({ top: 0, behavior: 'instant' })`) is
called from exactly three places, all of them genuine "open a new release"
entry points: the grid card click, `openSearchResult()`, and a manual click
on a Reel row. **It is deliberately *not* called from inside
`renderAlbumView()`/`renderMain()` themselves** — those also re-render when
switching discs within an *already-open* multi-disc release
(`disc-card.onclick → renderMain()`), and forcing a scroll-to-top on every
disc switch would be an annoying, unrequested behavior nobody asked for.

**Also deliberately not covered:** `advanceChrono()`/`retreatChrono()` — the
automatic release-to-release jump that happens mid-playback when "Spin the
Cylinder" finishes one release and moves to the next on its own. If the user
is scrolled elsewhere doing something unrelated when that automatic jump
happens, yanking their viewport to the top without any direct action on
their part would likely feel intrusive rather than helpful. Only a *manual*
click on a Reel row scrolls to top; the same jump happening automatically
during continuous playback does not. If this distinction is ever reconsidered,
the one thing to change is adding `scrollToTopInstant()` inside
`playChronoFromReel()` itself instead of only in the Reel row's click handler
— that would make it fire for the automatic case too.

---

## Accessibility

A handful of clickable elements — catalog cards, disc cards, search result
rows, Reel rows, and the play/pause halo ring — are `<div>` elements rather
than real `<button>`s, because they need custom internal layout (a cover
image plus multi-line text) that a `<button>` can't cleanly hold without
fighting its default styling. Each of those carries `role="button"`,
`tabindex="0"`, and a descriptive `aria-label` set at creation time.

**Native buttons get Enter/Space activation for free; divs don't.** Rather
than wire an individual `keydown` handler into every one of those creation
sites, there is exactly **one** delegated listener on `document`:

```js
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const target = document.activeElement;
  if (target && target.getAttribute && target.getAttribute('role') === 'button'){
    e.preventDefault();
    target.click();
  }
});
```

Any *new* div-based clickable component automatically gets keyboard support
for free just by carrying `role="button"` — there's nothing else to wire up.

Other small additions from the same pass: every dynamically-created `<img>`
(grid covers, disc-card covers, the solo cover, search result thumbnails) now
has meaningful `alt` text (the release/disc title) instead of none; the
prev/next transport buttons have explicit `aria-label`s (their `title`
attribute alone isn't reliably announced by every screen reader); and the
play/pause control's `aria-label` is kept in sync with its actual state
inside `updatePlayIcon()` — the same single function that already swaps the
icon, so there's one source of truth for both.

No visual design changed as a result of any of this — default browser focus
outlines apply to the newly-focusable elements, and nothing sets `outline:none`
anywhere that would suppress them (the one `outline:none` in the whole
stylesheet is on `.search-input`, which already has its own visible
border-color change on focus as a substitute indicator).

---

## Performance notes

A short, honest list of what was actually worth fixing versus what was
checked and deliberately left alone — see the audit log below for the full
reasoning on each:

- **Fixed:** the search index memoization (above), the cursor's mobile
  `matchMedia` gate (above), the prefetch blob URL lifecycle bug (above), and
  three DOM lookups that were repeated on every render/scroll
  (`projectInfoText`, `projectInfoToggle`, `#atmosphere`) instead of cached
  once as top-level `const`s.
- **Checked, left alone:** `highlightPlayingRow()` re-queries `.track` rows
  on every track change rather than tracking the previously-highlighted
  element in a variable. This runs once per song, over a few dozen elements
  at most — genuinely too cheap to be worth the added complexity of tracking
  extra state for it.
- **Checked, left alone:** `buildAlbum()`/`buildCatalog()` are long functions
  by necessity (recursive Drive-tree walking with multi-disc branching), not
  by carelessness. Splitting them further would add indirection without
  making the logic any clearer.

---

## Atmosphere — the per-project background identity system

**What it is:** a purely visual, purely CSS+SVG layer that gives each of the
five projects its own ambient background, entirely decoupled from data,
playback, and rendering logic. It lives inside `index.html` only — the
`<style>` block (search for `Atmosphere —`) and the `<div id="atmosphere">`
markup right after `<body>`.

**How it's wired to the rest of the app:** `applyProjectAtmosphere()` is the
*only* JS function that touches Atmosphere, and all it does is swap one
class on `#atmosphere`:

```js
const PROJECT_BG_CLASS = { 'Antelia': 'proj-antelia', 'ARIA': 'proj-aria', 'Arken': 'proj-arken', 'Manto': 'proj-manto', 'Mauro Fuentes': 'proj-mauro' };
```

Every visual difference between projects — glow color, which SVG layer is
visible, line color, animation timing — is driven purely by CSS selectors
scoped under `.atmosphere.proj-X`. Adding a sixth project only needs one new
entry in `PROJECT_BG_CLASS`; the rest is CSS/SVG.

There's one deliberate exception, unrelated to per-project switching: a
scroll-parallax effect (search `--sy`) reads scroll position and nudges the
ambient glow blobs via a CSS custom property, using the cached `atmosphereEl`
reference — that's the one place JS reaches into Atmosphere's styling, and
it's project-agnostic.

### Structure

Two layers stack inside `#atmosphere` (`z-index:0`, fixed, behind the whole
`.app`, `pointer-events:none` throughout):

1. **Ambient glow** (`.atmosphere::before` / `::after`) — two large, heavily
   blurred, softly drifting circles using `--atmo-1` / `--atmo-2`, overridden
   per project so the same two pseudo-elements repaint on class swap.
   Deliberately near-monochrome for every project **except Antelia**, the
   one identity allowed to be multicolor (its rings carry the color; the
   glow underneath stays a dim magenta/purple wash).
2. **Line-art layer** (`.atmo-layer`) — five `<div class="atmo-layer atmo-layer-X">`
   blocks, one per project, each wrapping one inline SVG. All five are
   always in the DOM; only the active one is visible via opacity, which is
   why switching projects fades smoothly (`.atmo-layer` has
   `transition:opacity 1.6s ease`) instead of hard-cutting.

### The shared visual grammar

- Stroke width ~0.5–0.7px, `fill:none`.
- `vector-effect="non-scaling-stroke"` on every stroked element, so lines
  stay crisp regardless of scaling.
- `mix-blend-mode:screen` on `.atmo-layer` — lets thin strokes glow subtly
  against the near-black background.
- One shared "breathing" keyframe family (`atmoBreathe21`/`24`/`25`/`28`/`30`)
  — a near-imperceptible scale pulse (≤1.8%). Duration is the *one* place
  each project diverges in pace, tied to its symbolic number (Antelia 7 →
  21s, Aria 12 → 24s, Arken 5 → 25s, Manto 4 → 28s, Mauro Fuentes 1 → 30s).
- No fast motion anywhere. `@media (prefers-reduced-motion: reduce)` kills
  every Atmosphere animation.

### Per-project identity

| Project | Symbolic number | Concept | Color | Geometry |
|---|---|---|---|---|
| **Antelia** | 7 | Resonance, spectrum, light | Full rainbow (only multicolor layer) | 7 offset rings, radius decreasing, one hue per ring |
| **Aria** | 12 | The sky, constellations | Ice blue | 12 stars + connecting edges, plus faint unconnected background stars |
| **Arken** | 5 | Deep ocean, bathymetric charts, currents | Dark petroleum blue | 5 horizontal current lines, spacing loosely following φ |
| **Manto** | 4 | Creative laboratory / research notebook | Warm gray / tan | 4 diagram clusters: axis+circle, radius+arc, curve+guide line, node graph |
| **Mauro Fuentes** | 1 | The author, the origin, sobriety | Neutral gray | Single central crosshair axis + minimal tick marks — the most minimal of the five, intentionally |

### Editing or adding to Atmosphere

- **To restyle one project:** find its `.atmo-layer-X` block and its
  `--atmo-1`/`--atmo-2` override. Never touch JS for this.
- **To retune shared behavior:** edit the shared rules once (`.atmo-layer`,
  `.atmo-breathe`, etc.) — applies to all five projects by construction.
- **To add a sixth project:** one SVG block, one opacity rule, one
  `--atmo-1`/`--atmo-2` override, one `PROJECT_BG_CLASS` entry, one
  breathing-duration class.
- **Whenever you edit this block, bump the `sw.js` `CACHE` version** —
  Atmosphere edits are easy to mistake for "just visual" and skip this step.

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
  (without number or extension) is the matching key used by videos, lyrics,
  and catalog search; parsed in `parseTrackName()`.
- Categories are auto-ordered via `CATEGORY_PRIORITY`: **Albums → Extended →
  Singles → Lives → Collabs → Specials**. Anything not in that list is pushed
  to the end.

**Multi-disc / multi-part releases:** if a release folder has *no* mp3s
directly inside it but has subfolders instead (e.g. `se7en I`, `se7en II`,
`se7en III`), `buildAlbum()` treats each subfolder as its own "disc" in a
carousel (`album.discs[]`), each with its own cover, video map, and lyrics map.

**Cover art priority** (`pickCoverImage()`): **"(art by ...)"** in the name
wins; failing that, "front"/"cover"/"folder"; "back"/"booklet"/"inside"/
"photo shoot" etc. are actively deprioritized. Everything else is still
browsable in the lightbox gallery, just not as the default thumbnail.

---

## Adding videos (VID files)

Plain text file named exactly **VID** inside a release's `Cover Art` folder.
Blocks separated by a blank line: first line is a track title (or `RELEASE`
for a full-release video), followed by one or more YouTube links.

```
RELEASE
https://youtu.be/xxxxxxxxxxx

01. Destruyan Nuestras Almas
https://youtu.be/aaaaaaaaaaa
https://youtu.be/bbbbbbbbbbb
```

- `RELEASE` links a video to the whole release — the play button appears
  next to the release/disc subtitle, not in the track list.
- Any other header matches a track's title (`attachVideos()`,
  case-insensitive; leading number/trailing `.mp3` stripped automatically).
- Multiple links under one header become arrow-navigable in the video lightbox.
- **The blank-line-separated format here differs from LYR below** — don't
  confuse the two when editing either file.

## Adding lyrics (LYR files)

Plain text file named exactly **LYR** in the same `Cover Art` folder. Unlike
VID, blank lines are **preserved** as real stanza breaks. A new song starts
only when a line begins with a track number (`parseLyricsText()` looks for
`^\d+\.`):

```
01. Destruyan Nuestras Almas.mp3
Destruyan Nuestras Almas

estoy llegando hasta el final
reptando por tu piel

02. Fuera de la Colmena
...
```

- The line right after the header, if it exactly repeats the track title, is
  auto-skipped.
- Formatting: `*text*` renders **bold**, `_text_` renders *italic*, both can
  span multiple lines. `formatLyricsText()` escapes HTML first, so raw
  `<`/`>`/`&` in lyrics are safe.
- Same cylinder-scroll physics as the Reel and catalog search.
- No LYR file, or no title match → no lyrics button for that track. Nothing
  breaks either way.

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
generic error, it's usually a GitHub hiccup — hit **Re-run jobs** first.

---

## Caching — three layers now, don't confuse them

1. **Catalog cache** (`localStorage`, key `CACHE_KEY`, `CACHE_TTL_MS` = 1
   hour): avoids re-walking all of Drive on every page load. **Retune**
   forces `getCatalog(true)`, bypassing this. **If the shape of the data
   `buildAlbum()`/`buildCatalog()` return ever changes, bump `CACHE_KEY`**
   so visitors with an old cached shape don't hit `undefined` errors.
2. **Search index cache** (in-memory, `searchIndexCache`): rebuilt lazily on
   first search after being invalidated. Invalidated at both places
   `CATALOG` is reassigned. Not persisted across page loads — this is a
   cheap, request-scoped memoization, not a second `localStorage` layer.
3. **App shell cache** (`sw.js`, the `CACHE` constant): precaches
   `index.html`, `manifest.json`, and both icon files for offline/installed
   use, and — since the last audit pass — also opportunistically caches any
   *other* same-origin GET response as it's fetched (see **PWA** below), so
   the offline story isn't limited to exactly the files listed at install
   time. **Bump `CACHE` on every deploy.** This is the one that has actually
   caused "I uploaded the fix but nothing changed" confusion multiple times
   — a service worker holding onto the old file, not a Drive/GitHub problem.

---

## PWA

**`manifest.json`:** `id` (stable identity if `start_url` ever changes),
`name`/`short_name` (name the *app itself* — "The Anti™ Radio" — not the
umbrella brand, see **Brand & scope**), `description` (mentions The Antelia™
Experience as the brand it serves), `start_url`/`scope` (`./index.html` /
`./`), `display: standalone`, `background_color`/`theme_color` matching the
site's own `#0a0a0d`, `orientation: portrait`, `lang: en`, and both icons
declared with `"purpose": "any maskable"` (verified safe — see the icon note
under **Files in this repo**).

**`<link>` tags in `index.html`'s `<head>`:** a `manifest.json` correctly
declaring icons is not enough on its own. `<link rel="icon" href="icon-192.png">`
gives the browser tab a real favicon instead of the generic default, and
`<link rel="apple-touch-icon" href="icon-192.png">` exists because iOS Safari
has historically not read the manifest's `icons` array for its own
"Add to Home Screen" icon — without this tag, iOS falls back to a screenshot
of the page as the icon. Both were missing before this audit pass.

**`sw.js` fetch strategy:** cache-first for same-origin GET requests, with a
cache-fill on miss — a same-origin request not found in the cache falls
through to the network, and if the response is a successful, non-opaque
(`type: 'basic'`) response, it's written into the cache before being
returned. Previously the miss path only fetched from network and never
stored the result, so anything same-origin outside the initial precache list
would hit the network every single time and never actually work offline
after that first load. Cross-origin requests (Drive's API, YouTube embeds)
are explicitly excluded via `url.origin !== location.origin` and pass
straight through, untouched — this app never wants to cache or intercept
Drive responses.

---

## Engineering audit log

This project went through a full audit pass — dead code, duplication,
performance, CSS, JS, accessibility, and PWA correctness — before being
paused. Recorded here so a future session doesn't re-discover (or
re-question) the same things from scratch. If you're an AI assistant
auditing this file again later: the dead-code checks below were mechanical,
not eyeballing — grep every class/id/function name across the full file and
flag anything with a reference count of exactly one (only its own
definition). That's a cheap, reliable first pass before trusting any
"this looks unused" instinct.

**Dead code removed:**
- `.atmo-line-draw` + `@keyframes atmoDraw` — defined in CSS, claimed to be
  "used for Manto's diagram connectors," but no SVG element anywhere ever
  carried that class. Leftover from an earlier iteration replaced by the
  `.atmo-mark` opacity-fade approach that's actually in use.
- A duplicate `.share-btn:hover` rule — two adjacent, identically-scoped
  rules where the second only overrode `color`. Merged into one.
- `const projectInfo = document.getElementById('projectInfo');` — declared,
  never read again. (The actual `<div id="projectInfo">` element is untouched
  and still used elsewhere, just not through this unused variable.)
- Ghost selectors in the cursor's hover-detection list (`.chip`, `.nav-arrow`,
  `[onclick]`) matching nothing in the current markup — removed;
  `.search-result` added in their place since it was a real, missing case.
- Two separate `@media (max-width:600px)` blocks merged into one.
- A no-op `stroke-dasharray:none` (the SVG default value anyway) removed —
  it only ever made sense by contrast with `.atmo-line-draw`, already gone.

**Functional bugs fixed:**
- **Search dropdown height was fixed regardless of result count** — a
  single result left a large empty space reserved for five. Now dynamic
  (see Catalog search above).
- **Opening a release from the grid didn't reset scroll position** — if the
  user had scrolled down, the new album view could render off-screen,
  feeling broken. Fixed at the three real "open" entry points (see **Scroll
  behavior** above), deliberately *not* inside the generic render functions.
- **Blob URL revocation could target the currently-playing track** instead
  of a genuinely discarded prefetch buffer — see **Player & playback
  mechanics** above for the full explanation. This was a real, if subtle,
  correctness bug, not just a style issue.
- **The custom cursor ran unconditionally on every device**, including
  touch-only phones that could never see it — the actual cause of "feels
  heavier on mobile," unrelated to the interpolation constant. Now gated
  behind the same `hover`/`pointer` media feature the CSS already used.

**Performance fixes:**
- Catalog search rebuilt its full index from the nested `CATALOG` tree on
  every keystroke — now memoized (see Catalog search above).
- Three DOM elements (`projectInfoText`, `projectInfoToggle`, `#atmosphere`)
  were re-queried on every render or scroll event instead of cached once.

**Accessibility additions:** `role="button"`/`tabindex="0"`/`aria-label` on
div-based clickable elements, one delegated Enter/Space keydown handler,
`alt` text on every dynamically-created image, explicit `aria-label`s on the
transport controls, and a synced `aria-label` on play/pause. Full detail in
**Accessibility** above.

**PWA fixes:** missing favicon/`apple-touch-icon` links added; `sw.js`'s
fetch handler now actually caches what it fetches instead of only reading
from cache; `manifest.json` gained an `id` field.

**Checked and deliberately left unchanged:** `highlightPlayingRow()`'s
per-track-change DOM re-query, and the overall length/structure of
`buildAlbum()`/`buildCatalog()` — both reviewed and found to be the right
amount of complexity for what they do, not candidates for "optimization for
its own sake." See **Performance notes** above for the reasoning on each.

---

## Known limits (read before assuming something's a bug)

- **Audio streaming** goes through the Drive API's `alt=media` endpoint with
  the API key. Fine for low/moderate traffic; Google can throttle a single
  file if hit unusually hard in a short window. Long-term fix if this becomes
  real would be a proper CDN (Cloudflare R2, Backblaze B2) — the Drive/API-key
  setup was never built for viral-scale traffic.
- **Multi-disc + chronological playback**: if "Spin the Cylinder" crosses
  from disc I into disc II of a multi-disc release, audio correctly moves
  forward, but the on-screen disc picker doesn't auto-switch to show disc II
  — the now-playing highlight can go quiet until the user manually picks
  that disc. Single-disc releases don't have this issue. Would need
  `state.discIndex` to track the flattened chrono queue position across disc
  boundaries, which `getAllTracksForItem()`'s flattening doesn't currently
  preserve enough info to do cleanly.
- **Next-track prefetch only covers same-queue transitions** — it does
  **not** prefetch across a "Spin the Cylinder" release boundary (the jump
  `advanceChrono()` makes). That jump still does a fresh network fetch with
  no pre-buffering.
- **Automatic chrono advance doesn't scroll to top** (see **Scroll
  behavior** above) — a deliberate choice, not an oversight, but worth
  knowing if it's ever reconsidered.
- **Shareable links assume unique dates within a project+category** — see
  **Shareable release links** above.
- **Mobile background playback is improved, not guaranteed.** Media Session
  API + prefetching measurably helps Android hold onto playback through a
  locked screen, but Chrome's background-tab freezing and per-manufacturer
  battery optimization (MIUI, Samsung, etc.) can still kill it — an OS-level
  policy, not something fixable purely from a browser tab's JS. Installing
  as a PWA (Add to Home Screen) and/or disabling battery optimization for
  the browser app helps; neither is something the code can force.
- **Large catalogs**: `buildCatalog()` walks every folder live, in parallel
  batches, on every cache-miss load. Fine at current scale; if this ever
  grows into the hundreds of releases, a periodically pre-generated catalog
  JSON (built by a script, not walked live per visitor) would load faster.
- **A track failing to load** shows a brief inline message and auto-advances
  after ~1.2s instead of stalling playback silently — already handled, not
  a gap, mentioned here only so it isn't mistaken for one.

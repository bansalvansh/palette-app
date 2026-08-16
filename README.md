# Palette &mdash; MVP with backend + real face/pose analysis

A working prototype: upload a photo, answer 3 quick questions, get clothing
recommendations with live "shop now" links to Myntra, Amazon, Ajio and
Flipkart.

Analysis is real computer vision, not a placeholder:
- **Face detection** (Google MediaPipe Face Landmarker, runs in-browser via
  WebAssembly) finds 478 facial points. No face found &rarr; upload is
  rejected, which is what stops screenshots/graphics from being "analyzed".
- **Undertone** is sampled from cheek/forehead landmarks specifically (not a
  blind crop), converted to LAB color space, and classified using the `b`
  (blue&harr;yellow) channel &mdash; the standard signal for warm/cool skin
  undertone classification.
- **Body shape** (Google MediaPipe Pose Landmarker) reads shoulder and hip
  keypoints and computes their width ratio to estimate a starting body shape.
  A single photo can't reliably detect waist definition (clothing hides it),
  so the detected shape is shown as an editable, pre-selected chip rather
  than a fixed verdict &mdash; the person confirms or corrects it.

Matching, catalog (now tagged with which body shapes each item flatters),
and analytics are served by a Node/Express backend backed by SQLite.

## Run it locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

The first run auto-creates `server/palette.db` (SQLite) and seeds it with the
32-item demo catalog (16 men's, 16 women's). Delete that file any time to
reset the catalog and analytics.

## Project structure

```
palette-app/
├── server/
│   ├── server.js      # Express app + all API routes
│   └── db.js           # SQLite setup + catalog seed data
├── public/
│   └── index.html      # Frontend (vanilla JS, calls the API)
├── package.json
└── .env.example
```

## API

| Method | Route            | Purpose                                              |
|--------|------------------|-------------------------------------------------------|
| GET    | `/api/catalog`   | List catalog items (`?gender=men` or `women`)          |
| POST   | `/api/match`     | Score catalog against `{gender, undertone, bodyShape, occasion, style, budget}` and return items with shop links |
| POST   | `/api/events`    | Log an analytics event (`photo_analyzed`, `analysis_rejected`, `body_shape_overridden`, `shop_click`) |
| GET    | `/api/analytics` | Aggregate counts for the dashboard footer              |

## What's real vs. still stubbed

**Real:** face detection and rejection of non-face images, landmark-based
undertone sampling in LAB color space, pose-based shoulder/hip body-shape
estimation, the Express server, SQLite persistence, the matching algorithm
(now scoring on undertone + body shape + occasion + style + budget), event
logging, and the shop-out links &mdash; those are live search URLs on each
real site, so they always return current stock and pricing.

**Stubbed:** the catalog is 32 hand-picked demo items, not a live product
feed, and the `flatters` (body-shape) tags on each item are my styling
judgment, not derived from real garment data. Rectangle vs. hourglass can't
be told apart from a photo alone (needs waist definition), so that's left to
the person to confirm. There's no user login/session &mdash; analytics are
global counts, not per-user.

## Color analysis: contrast reading (Bright/True/Soft seasons)

Real seasonal color analysis (the kind professional colorists do) judges on
three axes: warm/cool (hue), light/dark (value), and clear/soft (contrast).
The app previously only read the first two. It now also samples iris color
(from the model's iris landmarks) and a patch above the hairline, and
measures how far their lightness sits from skin tone lightness. High
contrast between skin/hair/eyes reads toward "Bright" seasons, low contrast
toward "Soft" ones, moderate contrast stays "True" &mdash; giving results like
"Bright Spring" or "Soft Autumn" instead of just "warm, light." Both hair and
eye sampling are optional and independently gracefully degrade: a hat,
glare, dyed hair, or hair out of frame just means that part of the read is
skipped (shown as a note in the UI) rather than guessed at.

Also added: a shoulder-tilt check before trusting the shoulder/hip ratio for
body shape. A photo where the person is leaning or the camera is angled
skews that ratio even when their proportions are normal, so a steep tilt now
downgrades body-shape confidence to low with an explanatory note, instead of
silently returning a skewed answer.

## Category selection

The quiz now asks what the person is shopping for (T-Shirts, Shirts, Jeans,
Jackets, Sweaters, Kurtas for menswear; similar plus Tops/Dresses for
womenswear). This is sent as `category` to `/api/catalog` and `/api/match`
and filters the SQL query directly &mdash; see `VALID_CATEGORIES` in
`server/server.js` if you add a new category, it needs to go in that list too
or the request gets rejected by validation.

## Real vs. demo products, and how to tell them apart

Five items in the seed catalog (`server/db.js`) are verified against real,
currently-live Myntra listings, found via live search at the time this was
built: an H&amp;M corduroy overshirt, WROGN jeans, and a Roadster t-shirt
(menswear), plus a Vero Moda wrap dress and a Libas kurta (womenswear) &mdash;
each with a real price and a real `real_url` pointing at the actual product
page. Every other item is a demo entry with only a `search_query` fallback. The frontend
shows a "Verified listing" badge on any item where `isRealListing` is true,
so you (and anyone you show this to) can see exactly which parts are real
right now versus which are placeholders.

## How matching ranks results
`/api/match` in `server/server.js` scores every item on fit first: undertone
match, body-shape match, occasion, style, and budget. That fit score decides
the ranking. Only when two items score exactly the same does a secondary
tiebreak kick in, preferring the item that's a verified/real listing over a
demo one. This is deliberate: a real product should get a nudge once it's
equally relevant, but it should never outrank something that's a genuinely
better fit just because it's the one you can monetize. Worth keeping that
principle as the catalog grows &mdash; it's the difference between a
recommendation engine and an ad engine wearing a recommendation engine's
clothes.

**Important finding from building this:** directly fetching Myntra product
pages to scrape images was blocked (got a maintenance/bot-block page, not
real content). Search-based lookups work for finding real product names,
prices, and page URLs; direct scraping for images does not work reliably.
This is normal &mdash; it's exactly why real affiliate feeds exist as a
product. Don't build a business on scraping Myntra directly; it's fragile
and likely against their terms of service.

## Getting real product photos + tracked commission links (the real path)

This is the actual production step, not optional polish:

1. Apply for **Amazon Associates** (amazon.in affiliate program) &mdash;
   approval is comparatively fast, especially once you have some traffic.
2. Once approved, use **SiteStripe** (a toolbar Amazon gives approved
   Associates) on any product page to generate both a real image URL and a
   tracked affiliate link for that exact product, with your commission tag
   baked in.
3. Fill in `image_url` and `affiliate_url` for each catalog row in
   `server/db.js` (or, once you have enough products, build a small admin
   script that reads a CSV export of SiteStripe links and updates the DB in
   bulk).
4. That's it &mdash; `rowToItem()` and `buyUrl` logic in `server/server.js`
   already prefer `affiliateUrl` first, so real monetized links take over
   automatically as soon as they're filled in, no other code changes needed.

For broader coverage across many retailers at once instead of just Amazon,
apply to an aggregator like **EarnKaro**, **Cuelinks**, or **INRDeals** &mdash;
these give you one dashboard covering Myntra, Ajio, Flipkart, Amazon and
others, often with a product feed API that includes images, once approved.

## Deploying so it's reachable online

This backend is a standard Node/Express app, so any Node host works. Easiest
free-tier options:

1. **Render** (render.com) &mdash; connect your GitHub repo, set build command
   `npm install`, start command `npm start`. Free tier sleeps when idle.
2. **Railway** (railway.app) &mdash; similar flow, auto-detects Node apps.
3. **Fly.io** &mdash; more control, needs a `Dockerfile` (ask me if you want
   one generated).

Push this folder to a GitHub repo first (`git init && git add . && git commit
-m "init"` then create a repo and push), then connect that repo on whichever
host you pick. `better-sqlite3` is a native module &mdash; all three hosts
above support it out of the box since they build on Linux, same as this dev
environment.

## Next steps worth prioritizing

1. Get approved on an affiliate network (EarnKaro/Cuelinks are fastest for a
   pre-launch account in India) and swap in real tracked links.
2. Replace the hand-typed catalog with a real feed once you have one.
3. Add basic auth/session if you want per-user history instead of global
   analytics.

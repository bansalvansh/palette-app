require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const path = require('path');
const { db, seedIfEmpty } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // set this to your real domain in production

const VALID_GENDERS = ['men', 'women'];
const VALID_UNDERTONES = ['warm', 'cool', 'neutral'];
const VALID_BODY_SHAPES = ['invertedTriangle', 'pear', 'rectangle', 'hourglass', 'oval'];
const VALID_OCCASIONS = ['everyday', 'office', 'festive', 'evening'];
const VALID_STYLES = ['minimal', 'classic', 'bold', 'streetwear'];
const VALID_CATEGORIES = ['tshirt', 'shirt', 'jeans', 'jacket', 'sweater', 'kurta', 'dress', 'top'];
const VALID_EVENT_TYPES = ['photo_analyzed', 'analysis_rejected', 'body_shape_overridden', 'shop_click'];

// ---------------------------------------------------------------
// security & ops middleware
// ---------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false, // the frontend loads MediaPipe/fonts from external CDNs; tighten this with your real CDN list before launch
}));
app.use(cors({ origin: NODE_ENV === 'production' ? ALLOWED_ORIGIN : '*' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '256kb' })); // no photo bytes ever hit the server, so payloads are small

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                 // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
});
app.use('/api/', apiLimiter);

const matchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // matching is the heaviest route; keep it tighter than the general limiter
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many match requests, slow down a little.' },
});

app.use(express.static(path.join(__dirname, '..', 'public')));

seedIfEmpty();

// ---------------------------------------------------------------
// GET /api/health  -> for uptime monitoring / load balancer checks
// ---------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, time: new Date().toISOString() });
});

// ---------------------------------------------------------------
// GET /api/catalog?gender=men
// ---------------------------------------------------------------
app.get('/api/catalog',
  query('gender').optional().isIn(VALID_GENDERS),
  query('category').optional().isIn(VALID_CATEGORIES),
  handleValidation,
  (req, res) => {
    const gender = req.query.gender === 'women' ? 'women' : 'men';
    let rows;
    if (req.query.category) {
      rows = db.prepare('SELECT * FROM catalog WHERE gender = ? AND category = ?').all(gender, req.query.category);
    } else {
      rows = db.prepare('SELECT * FROM catalog WHERE gender = ?').all(gender);
    }
    res.json(rows.map(rowToItem));
  }
);

// ---------------------------------------------------------------
// POST /api/match
// ---------------------------------------------------------------
app.post('/api/match',
  matchLimiter,
  body('gender').isIn(VALID_GENDERS),
  body('undertone').isIn(VALID_UNDERTONES),
  body('bodyShape').optional({ nullable: true }).isIn(VALID_BODY_SHAPES),
  body('category').optional({ nullable: true }).isIn(VALID_CATEGORIES),
  body('occasion').isIn(VALID_OCCASIONS),
  body('style').isIn(VALID_STYLES),
  body('budget').isInt({ min: 0, max: 1000000 }),
  handleValidation,
  (req, res, next) => {
    try {
      const { gender, undertone, bodyShape = null, category = null, occasion, style, budget } = req.body;
      const budgetMax = Number(budget);

      const rows = category
        ? db.prepare('SELECT * FROM catalog WHERE gender = ? AND category = ?').all(gender, category)
        : db.prepare('SELECT * FROM catalog WHERE gender = ?').all(gender);

      let scored = rows.map(rowToItem).map(item => {
        let fitScore = 0;
        if (item.colorFamily === undertone) fitScore += 3;
        if (item.colorFamily === 'neutral') fitScore += 1.5;
        if (bodyShape && item.flatters.includes(bodyShape)) fitScore += 3;
        if (item.occasion.includes(occasion)) fitScore += 2;
        if (item.style.includes(style)) fitScore += 2;
        if (item.price <= budgetMax) fitScore += 1;
        else fitScore -= 3;
        return { ...item, fitScore, isRealListing: !!(item.affiliateUrl || item.realUrl) };
      }).filter(i => i.fitScore > 0)
        // fit quality decides the ranking first -- a verified listing never outranks a
        // genuinely better fit. Only when two items fit equally well does being a real,
        // monetizable listing break the tie, since that's a legitimate business preference
        // once relevance is already equal.
        .sort((a, b) => (b.fitScore - a.fitScore) || (Number(b.isRealListing) - Number(a.isRealListing)))
        .slice(0, 8);

      if (scored.length === 0) {
        scored = rows.map(rowToItem)
          .map(item => ({ ...item, fitScore: 0, isRealListing: !!(item.affiliateUrl || item.realUrl) }))
          .sort((a, b) => a.price - b.price)
          .slice(0, 4);
      }

      const withLinks = scored.map(item => ({
        ...item,
        buyUrl: item.affiliateUrl || item.realUrl || buildAmazonSearchUrl(item.searchQuery),
        isMonetized: !!item.affiliateUrl,
        shopLinks: buildShopLinks(item.searchQuery),
      }));

      logEvent('matched', { gender, undertone, bodyShape, category, occasion, style, count: withLinks.length });

      res.json({ items: withLinks });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------
app.post('/api/events',
  body('type').isIn(VALID_EVENT_TYPES),
  body('meta').optional().isObject(),
  handleValidation,
  (req, res, next) => {
    try {
      const { type, meta } = req.body;
      logEvent(type, meta || {});
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------
// GET /api/analytics
// ---------------------------------------------------------------
app.get('/api/analytics', (req, res, next) => {
  try {
    const countOf = (type) =>
      db.prepare('SELECT COUNT(*) AS c FROM events WHERE type = ?').get(type).c;

    res.json({
      photosAnalyzed: countOf('photo_analyzed'),
      photosRejected: countOf('analysis_rejected'),
      matchesShown: db.prepare("SELECT COALESCE(SUM(json_extract(meta, '$.count')), 0) AS s FROM events WHERE type = 'matched'").get().s,
      shopClicks: countOf('shop_click'),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Invalid request', details: errors.array() });
  }
  next();
}

function rowToItem(row) {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    price: row.price,
    category: row.category,
    occasion: JSON.parse(row.occasion),
    style: JSON.parse(row.style),
    colorFamily: row.colorFamily,
    flatters: JSON.parse(row.flatters),
    swatch: row.swatch,
    imageUrl: row.image_url || null,
    realUrl: row.real_url || null,
    affiliateUrl: row.affiliate_url || null,
    searchQuery: row.search_query,
  };
}

function buildAmazonSearchUrl(searchQuery) {
  return `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
}

function buildShopLinks(searchQuery) {
  const q = encodeURIComponent(searchQuery);
  const slug = searchQuery.trim().toLowerCase().replace(/[^a-z0-9]+/g, '+');
  return {
    Myntra: `https://www.myntra.com/${slug}`,
    Amazon: buildAmazonSearchUrl(searchQuery),
    Ajio: `https://www.ajio.com/search/?text=${q}`,
    Flipkart: `https://www.flipkart.com/search?q=${q}`,
  };
}

function logEvent(type, meta) {
  db.prepare('INSERT INTO events (type, meta, created_at) VALUES (?, ?, ?)')
    .run(type, JSON.stringify(meta || {}), new Date().toISOString());
}

// ---------------------------------------------------------------
// 404 + centralized error handler (must be last)
// ---------------------------------------------------------------
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

app.listen(PORT, () => {
  console.log(`Palette server running on port ${PORT} [${NODE_ENV}]`);
});

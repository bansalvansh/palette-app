const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'palette.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gender TEXT NOT NULL,
    category TEXT NOT NULL,     -- tshirt | shirt | jeans | jacket | sweater | kurta | dress | top
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    occasion TEXT NOT NULL,     -- JSON array
    style TEXT NOT NULL,        -- JSON array
    colorFamily TEXT NOT NULL,
    flatters TEXT NOT NULL,     -- JSON array of body shapes this cut flatters
    swatch TEXT NOT NULL,       -- fallback color shown until a real photo is added
    image_url TEXT,             -- real product photo, NULL until sourced from an affiliate feed
    real_url TEXT,               -- a real, specific, currently-live product page (found via search) -- not commission-tracked yet
    affiliate_url TEXT,         -- real tracked affiliate link, e.g. from Amazon SiteStripe once approved, NULL until filled in
    search_query TEXT NOT NULL  -- fallback Amazon search if neither url above exists
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL
  );
`);

// body shape tags used across the catalog:
// invertedTriangle (broad shoulders), pear (hips wider), rectangle (balanced, low waist definition),
// hourglass (balanced, defined waist), oval (fuller midsection)
//
// [brand, name, price, occasion[], style[], colorFamily, flatters[], swatch, category, searchQuery, realUrl?]
// realUrl is optional -- present only for the 2 items verified via live search against Myntra
// (real product, real current price, real page) as a proof of concept for what a real feed provides.
const CATALOG_SEED = {
  men: [
    ["H&M", "Men Corduroy Overshirt", 2699, ["everyday","office"], ["classic","minimal"], "warm", ["rectangle","oval"], "#B5723A", "jacket", "rust corduroy overshirt men", "https://www.myntra.com/shirts/hm/hm-men-corduroy-overshirt/21893938/buy"],
    ["Utility", "Olive Utility Jacket", 3499, ["everyday","streetwear"], ["streetwear","bold"], "warm", ["rectangle","pear"], "#6E7F66", "jacket", "olive utility jacket men"],
    ["Knitwear", "Mustard Knit Polo", 1299, ["everyday"], ["classic","minimal"], "warm", ["invertedTriangle","hourglass"], "#C9A15A", "tshirt", "mustard knit polo men"],
    ["Roadster", "Men White Pure Cotton T-Shirt", 379, ["everyday"], ["minimal","streetwear"], "neutral", ["invertedTriangle","hourglass","rectangle"], "#EDE7DD", "tshirt", "white crew neck t-shirt men", "https://www.myntra.com/tshirts/roadster/roadster-men-white-pure-cotton-t-shirt/11943322/buy"],
    ["Basics", "Rust Graphic T-Shirt", 799, ["everyday","streetwear"], ["streetwear","bold"], "warm", ["rectangle","hourglass"], "#B5723A", "tshirt", "rust graphic t-shirt men"],
    ["Linen", "Terracotta Linen Shirt", 1899, ["everyday","evening"], ["minimal","classic"], "warm", ["rectangle","invertedTriangle"], "#C1714B", "shirt", "terracotta linen shirt men"],
    ["Oxford", "Slate Blue Oxford Shirt", 1699, ["office","everyday"], ["classic","minimal"], "cool", ["hourglass","rectangle"], "#4A5A66", "shirt", "slate blue oxford shirt men"],
    ["Shirting", "Dusty Plum Shirt", 2199, ["evening","festive"], ["bold","classic"], "cool", ["hourglass","invertedTriangle"], "#8C5A7A", "shirt", "plum shirt men"],
    ["WROGN", "Men Navy Blue Slim Fit Stretchable Jeans", 799, ["everyday","streetwear"], ["classic","minimal"], "cool", ["hourglass","invertedTriangle"], "#2E3A52", "jeans", "navy slim fit jeans men", "https://www.myntra.com/jeans/wrogn/wrogn-men-navy-blue-slim-fit-mid-rise-clean-look-stretchable-jeans/11560162/buy"],
    ["Denim Co", "Black Straight Fit Jeans", 2399, ["everyday","office"], ["minimal","classic"], "neutral", ["rectangle","oval"], "#1B1C1F", "jeans", "black straight fit jeans men"],
    ["Denim Co", "Sand Wash Relaxed Jeans", 2099, ["everyday","streetwear"], ["streetwear","bold"], "warm", ["pear","rectangle"], "#B8A17E", "jeans", "light wash relaxed jeans men"],
    ["Tailored", "Ink Navy Blazer", 4999, ["office","evening"], ["classic"], "cool", ["rectangle","pear"], "#232C3A", "jacket", "navy blazer men slim fit"],
    ["Knitwear", "Steel Grey Sweater", 1999, ["everyday","office"], ["minimal"], "cool", ["oval","rectangle"], "#6E7580", "sweater", "grey sweater men crew neck"],
    ["Outerwear", "Emerald Bomber Jacket", 3299, ["streetwear","evening"], ["bold","streetwear"], "cool", ["pear","rectangle"], "#2F6E55", "jacket", "green bomber jacket men"],
    ["Knitwear", "Black Merino Polo", 1899, ["office","evening"], ["minimal","classic"], "neutral", ["hourglass","invertedTriangle"], "#17181B", "tshirt", "black merino polo men"],
    ["Ethnic", "Maroon Festive Kurta", 2499, ["festive"], ["classic","bold"], "warm", ["oval","rectangle","pear"], "#7A2E30", "kurta", "maroon kurta men festive"],
    ["Ethnic", "Teal Festive Kurta", 2599, ["festive"], ["bold"], "cool", ["oval","rectangle","pear"], "#256B6B", "kurta", "teal kurta men festive"],
  ],
  women: [
    ["Dresses", "Rust Wrap Midi Dress", 2299, ["everyday","evening"], ["classic","bold"], "warm", ["rectangle","invertedTriangle","oval"], "#B5723A", "dress", "rust wrap midi dress women"],
    ["Co-ord", "Mustard Co-ord Set", 2799, ["everyday","festive"], ["bold","streetwear"], "warm", ["hourglass","rectangle"], "#C9A15A", "top", "mustard co-ord set women"],
    ["Basics", "White Fitted T-Shirt", 599, ["everyday"], ["minimal","streetwear"], "neutral", ["hourglass","rectangle"], "#EDE7DD", "tshirt", "white fitted t-shirt women"],
    ["Tops", "Terracotta Blouse", 1399, ["office","everyday"], ["minimal","classic"], "warm", ["pear","rectangle"], "#C1714B", "top", "terracotta blouse women"],
    ["Ethnic", "Olive Anarkali Kurta", 2999, ["festive"], ["classic"], "warm", ["oval","invertedTriangle","pear"], "#6E7F66", "kurta", "olive anarkali kurta women"],
    ["Denim Co", "Dark Indigo Straight Jeans", 2099, ["everyday","streetwear"], ["classic","minimal"], "cool", ["hourglass","rectangle"], "#2E3A52", "jeans", "dark indigo straight jeans women"],
    ["Denim Co", "Black High-Waist Jeans", 2299, ["everyday","office"], ["minimal","classic"], "neutral", ["pear","hourglass"], "#1B1C1F", "jeans", "black high waist jeans women"],
    ["Knitwear", "Slate Blue Sweater", 1799, ["everyday","office"], ["minimal"], "cool", ["oval","rectangle"], "#4A5A66", "sweater", "slate blue sweater women"],
    ["Tailored", "Ink Navy Blazer Dress", 3599, ["office","evening"], ["classic","bold"], "cool", ["rectangle","pear"], "#232C3A", "dress", "navy blazer dress women"],
    ["Vero Moda", "Women Navy Blue Wrap Dress", 2799, ["evening"], ["bold","classic"], "cool", ["hourglass"], "#232C3A", "dress", "navy blue wrap dress women", "https://www.myntra.com/dresses/vero-moda/vero-moda-women-navy-blue-wrap-dress/6793378/buy"],
    ["Tops", "Steel Grey Wrap Top", 1299, ["everyday","office"], ["minimal","classic"], "cool", ["rectangle","invertedTriangle","oval"], "#6E7580", "top", "grey wrap top women"],
    ["Outerwear", "Emerald Green Blazer", 3299, ["office","evening"], ["bold"], "cool", ["pear","rectangle"], "#2F6E55", "jacket", "emerald green blazer women"],
    ["Libas", "Women Maroon Yoke Design Embellished Kurta", 899, ["festive"], ["classic","bold"], "warm", ["hourglass","pear","oval"], "#7A2E30", "kurta", "maroon embellished kurta women", "https://www.myntra.com/kurtas/libas/libas-women-maroon-yoke-design-embellished-kurta/18137424/buy"],
    ["Ethnic", "Teal Festive Kurta Set", 2899, ["festive"], ["bold"], "cool", ["oval","rectangle","invertedTriangle"], "#256B6B", "kurta", "teal kurta set women festive"],
  ],
};

function seedIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM catalog').get();
  if (c > 0) return;

  const insert = db.prepare(`
    INSERT INTO catalog (gender, category, brand, name, price, occasion, style, colorFamily, flatters, swatch, image_url, real_url, affiliate_url, search_query)
    VALUES (@gender, @category, @brand, @name, @price, @occasion, @style, @colorFamily, @flatters, @swatch, NULL, @realUrl, NULL, @searchQuery)
  `);

  const insertMany = db.transaction((entries) => {
    for (const e of entries) insert.run(e);
  });

  const rows = [];
  for (const gender of ['men', 'women']) {
    for (const [brand, name, price, occasion, style, colorFamily, flatters, swatch, category, searchQuery, realUrl] of CATALOG_SEED[gender]) {
      rows.push({
        gender, category, brand, name, price,
        occasion: JSON.stringify(occasion),
        style: JSON.stringify(style),
        colorFamily,
        flatters: JSON.stringify(flatters),
        swatch, searchQuery,
        realUrl: realUrl || null,
      });
    }
  }
  insertMany(rows);
  const verifiedCount = rows.filter(r => r.realUrl).length;
  console.log(`Seeded catalog with ${rows.length} items (${verifiedCount} verified against live listings; images/affiliate links empty until an approved feed is connected \u2014 see README).`);
}

module.exports = { db, seedIfEmpty };

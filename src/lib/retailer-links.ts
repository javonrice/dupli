// Build optimal retailer search URLs from a dupe's brand + product name.
// Used as a smart fallback when the AI doesn't return a precise product page.

export type RetailerLink = {
  label: string;
  url: string;
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "in", "on",
  "oz", "ml", "fl", "size", "pack", "new",
]);

function buildQuery(brand: string, productName: string): string {
  const raw = `${brand} ${productName}`.toLowerCase();
  const cleaned = raw
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9\s.+-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, 8) // keep query tight & relevant
    .join(" ")
    .trim();
  return cleaned || `${brand} ${productName}`.trim();
}

const RETAILER_TEMPLATES: Array<{
  match: RegExp;
  label: string;
  build: (q: string) => string;
}> = [
  {
    match: /amazon/i,
    label: "Amazon",
    build: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  },
  {
    match: /target/i,
    label: "Target",
    build: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  },
  {
    match: /walmart/i,
    label: "Walmart",
    build: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    match: /\bcvs\b/i,
    label: "CVS",
    build: (q) => `https://www.cvs.com/search?searchTerm=${encodeURIComponent(q)}`,
  },
  {
    match: /walgreens/i,
    label: "Walgreens",
    build: (q) => `https://www.walgreens.com/search/results.jsp?Ntt=${encodeURIComponent(q)}`,
  },
  {
    match: /ulta/i,
    label: "Ulta",
    build: (q) => `https://www.ulta.com/shop?Ntt=${encodeURIComponent(q)}`,
  },
  {
    match: /sephora/i,
    label: "Sephora",
    build: (q) => `https://www.sephora.com/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    match: /dollar tree/i,
    label: "Dollar Tree",
    build: (q) => `https://www.dollartree.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    match: /dollar general/i,
    label: "Dollar General",
    build: (q) => `https://www.dollargeneral.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    match: /trader joe/i,
    label: "Trader Joe's",
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:traderjoes.com ${q}`)}`,
  },
];

function isUsableUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Resolve the primary "Buy at X" link.
 * - Prefer the AI's precise buyUrl if it's a valid http(s) URL.
 * - Otherwise build a retailer search URL from `whereToBuy` + brand + product name.
 * - Falls back to a generic Google Shopping search.
 */
/**
 * Fallback retailer link when we don't have a verified product page.
 * Always points at a real retailer search (Amazon) — never Google.
 */
export function googleShoppingLink(brand: string, productName: string): RetailerLink {
  const query = buildQuery(brand, productName);
  return {
    label: "Amazon",
    url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
  };
}

export function resolveBuyLink(args: {
  brand: string;
  productName: string;
  whereToBuy?: string | null;
  buyUrl?: string | null;
}): RetailerLink {
  const { brand, productName, whereToBuy, buyUrl } = args;
  const query = buildQuery(brand, productName);

  if (isUsableUrl(buyUrl)) {
    return { label: whereToBuy?.trim() || "retailer", url: buyUrl };
  }

  const retailer = whereToBuy?.trim() ?? "";
  const template = retailer ? RETAILER_TEMPLATES.find((r) => r.match.test(retailer)) : undefined;
  if (template) {
    return { label: template.label, url: template.build(query) };
  }

  // Retailer label didn't match any known template (or none provided):
  // fall back to Google Shopping, which aggregates results across retailers.
  return googleShoppingLink(brand, productName);
}

/**
 * Build a small set of alternate retailer search links so the user can shop around.
 * Always includes Google Shopping as a safety-net fallback.
 * Excludes the primary retailer to avoid duplication.
 */
export function buildAlternateRetailerLinks(args: {
  brand: string;
  productName: string;
  excludeLabel?: string;
}): RetailerLink[] {
  const query = buildQuery(args.brand, args.productName);
  const exclude = args.excludeLabel?.toLowerCase() ?? "";
  const preferred = ["Amazon", "Target", "Walmart", "Ulta"];
  const retailerLinks = RETAILER_TEMPLATES.filter((r) => preferred.includes(r.label))
    .filter((r) => r.label.toLowerCase() !== exclude)
    .slice(0, 3)
    .map((r) => ({ label: r.label, url: r.build(query) }));

  const google = googleShoppingLink(args.brand, args.productName);
  const links = exclude === google.label.toLowerCase()
    ? retailerLinks
    : [...retailerLinks, google];
  return links;
}

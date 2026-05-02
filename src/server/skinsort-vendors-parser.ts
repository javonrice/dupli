// Parses Skinsort's lazy-loaded vendor turbo-frame:
//   https://skinsort.com/products/<brand>/<slug>/us/vendors
//
// Each vendor is an <a href="..."> wrapping a merchant logo + name + price chip.
// We capture: merchant name, click-through URL (kept as-is, including the
// affiliate wrapper so commission still tracks), and price in USD when
// numeric (Amazon shows "Search on Amazon" — we store no price for those).

export type ParsedVendor = {
  rank: number;
  merchant: string;
  url: string;
  priceUsd: number | null;
  currency: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const PRICE_RE = /\$\s*([0-9]+(?:\.[0-9]{1,2})?)/;

export function parseSkinsortVendors(html: string): ParsedVendor[] {
  if (!html.includes("Where to buy")) return [];

  const vendors: ParsedVendor[] = [];
  const seenMerchants = new Set<string>();

  // Each vendor card is an <a ...> with a "py-3" inner row, containing:
  //   <img alt="<Merchant> Logo" ...>
  //   <span ...>Merchant Name</span>
  //   <span ...>$12.99</span>  (or "Search on Amazon")
  //
  // We greedy-match each anchor up to its closing </a>.
  const anchorRe = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let rank = 0;

  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = decodeEntities(m[1]);
    const inner = m[2];

    // Skip anchors that aren't vendor cards.
    if (!/Logo/i.test(inner)) continue;
    if (!/py-3/.test(inner)) continue;

    // Merchant name: first <span>...</span> after the logo image.
    // Grab the alt-text fallback from the img tag if span match fails.
    let merchant = "";
    const altMatch = inner.match(/alt="([^"]+?)\s+Logo"/i);
    if (altMatch) merchant = decodeEntities(altMatch[1]).trim();
    if (!merchant) {
      const spanMatch = inner.match(
        /<span[^>]*class="[^"]*font-semibold[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/i,
      );
      if (spanMatch) merchant = decodeEntities(spanMatch[1]).trim();
    }
    if (!merchant) continue;

    const merchantKey = merchant.toLowerCase();
    if (seenMerchants.has(merchantKey)) continue;

    // Price chip: a span with $XX.XX. May be absent (e.g. "Search on Amazon").
    let priceUsd: number | null = null;
    const priceMatch = inner.match(PRICE_RE);
    if (priceMatch) {
      const n = Number(priceMatch[1]);
      if (Number.isFinite(n) && n > 0 && n < 100000) priceUsd = n;
    }

    seenMerchants.add(merchantKey);
    rank += 1;
    vendors.push({
      rank,
      merchant,
      url: rawHref,
      priceUsd,
      currency: "USD",
    });

    if (vendors.length >= 12) break;
  }

  return vendors;
}

export function buildVendorsUrl(brandSlug: string, productSlug: string): string {
  return `https://skinsort.com/products/${brandSlug}/${productSlug}/vendors`;
}

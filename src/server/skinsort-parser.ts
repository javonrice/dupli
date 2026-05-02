// Parses a SkinSort `/products/<brand>/<slug>/dupes` page HTML into typed product + dupe records.
// SkinSort renders dupes server-side as static HTML, so a single fetch is enough.

import { slugify } from "./skinsort-slugs";

export type ParsedProduct = {
  brandSlug: string;
  productSlug: string;
  brandName: string;
  productName: string;
  category: string | null;
  imageUrl: string | null;
  ingredientsCount: number | null;
  freeFrom: string[];
  goodFor: string[];
  contains: string[];
};

export type ParsedDupe = {
  rank: number;
  brandSlug: string;
  productSlug: string;
  brandName: string;
  productName: string;
  imageUrl: string | null;
  overallMatch: number;
  ingredientMatch: number | null;
  attributeMatch: number | null;
  sharedIngredientsCount: number | null;
  rationale: string | null;
};

export type ParsedSkinsortPage = {
  product: ParsedProduct;
  dupes: ParsedDupe[];
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

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Title formats observed:
//   "50 Best Dupes for Moisturizing Cream by CeraVe" (dupes page)
//   "CeraVe Moisturizing Cream (Ingredients Explained)" (product page)
function pickProductDisplay(html: string): { brand: string; product: string } | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  const t = decodeEntities(m[1]).trim();

  const dupesMatch = t.match(/^\d+\s+Best\s+Dupes\s+for\s+(.+?)\s+by\s+(.+?)(?:\s*\|.*)?$/i);
  if (dupesMatch) {
    return { product: dupesMatch[1].trim(), brand: dupesMatch[2].trim() };
  }

  const ingMatch = t.match(/^(.+?)\s+\(Ingredients Explained\)/i);
  if (ingMatch) {
    // Need to split brand vs product. Without a separator we can't be sure,
    // so return the whole thing as product and hope the slug fallback fills brand.
    return { brand: "", product: ingMatch[1].trim() };
  }

  return null;
}

function pickOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m ? m[1] : null;
}

function pickIngredientsCount(html: string): number | null {
  const m =
    html.match(/Ingredients?\s*\((\d+)\)/i) ||
    html.match(/\b(\d{1,3})\s+ingredients?\b/i);
  return m ? Number(m[1]) : null;
}

// Each dupe card looks like:
//   <div id="brand-product" class="...border-2 border-warm-gray-500">
//     ... <a href="/products/<brand>/<slug>"> ... <img alt="Brand Product" src="..."> ...
//     <h2><span>Brand</span> Product Name</h2>
//     <span class="text-4xl font-black">82%</span> match
//     67% Attribute Match
//     82% Ingredient Match
//     <strong>19 ingredients in common</strong>
//     Dupe Explained <p>...</p>
function parseDupeBlocks(html: string): ParsedDupe[] {
  const dupes: ParsedDupe[] = [];
  // Split on the dupe card opener. Each card has a unique id.
  const cardRe =
    /<div\s+id="([a-z0-9-]+)"\s+class="[^"]*border-2[^"]*">([\s\S]*?)(?=<div\s+id="[a-z0-9-]+"\s+class="[^"]*border-2|<\/body>|$)/gi;

  let m: RegExpExecArray | null;
  let rank = 0;
  const seen = new Set<string>();

  while ((m = cardRe.exec(html)) !== null) {
    const card = m[2];

    // The dupe link is the FIRST /products/<brand>/<slug> anchor inside the card,
    // labeled "The Dupe". Skip cards without a product link.
    const linkRe = /href="\/products\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/[^"]*)?"/g;
    const links: { brand: string; slug: string }[] = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(card)) !== null) {
      links.push({ brand: lm[1], slug: lm[2] });
    }
    if (links.length === 0) continue;
    const dupeLink = links[0];
    const key = `${dupeLink.brand}/${dupeLink.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Overall match: <span class="text-4xl font-black"> 82% </span>
    const overallMatch = card.match(
      /<span\s+class="text-4xl[^"]*">\s*(\d{1,3})\s*%\s*<\/span>/i,
    );
    if (!overallMatch) continue;
    const overall = Number(overallMatch[1]);
    if (!Number.isFinite(overall) || overall <= 0 || overall > 100) continue;

    // Sub-scores: chips like "<div ...>67% Attribute Match</div>"
    const attrMatch = card.match(/(\d{1,3})\s*%\s*Attribute\s+Match/i);
    const ingMatch = card.match(/(\d{1,3})\s*%\s*Ingredient\s+Match/i);
    const sharedMatch = card.match(/(\d+)\s+ingredients?\s+in\s+common/i);

    // Image: first <img alt="..."> in the card
    const imgMatch = card.match(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]+)"/i);
    const altText = imgMatch ? decodeEntities(imgMatch[1]) : "";
    const imgUrl = imgMatch ? imgMatch[2] : null;

    // Display name: <h2 ...><span ...>Brand</span> Product</h2>
    const h2Match = card.match(
      /<h2[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>\s*([^<]+?)\s*<\/h2>/i,
    );
    let displayBrand = h2Match ? decodeEntities(h2Match[1]).trim() : "";
    let displayProduct = h2Match ? decodeEntities(h2Match[2]).trim() : "";
    if (!displayProduct && altText) {
      // Fallback: use alt text "Brand Product Name"
      displayProduct = altText;
    }
    if (!displayBrand) {
      displayBrand = dupeLink.brand
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!displayProduct) {
      displayProduct = dupeLink.slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Rationale: "Dupe Explained" section, first <p> after that label.
    let rationale: string | null = null;
    const expIdx = card.search(/Dupe\s+Explained/i);
    if (expIdx > 0) {
      const after = card.slice(expIdx);
      const pMatch = after.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (pMatch) rationale = stripTags(pMatch[1]).slice(0, 1500);
    }

    rank += 1;
    dupes.push({
      rank,
      brandSlug: dupeLink.brand,
      productSlug: dupeLink.slug,
      brandName: displayBrand,
      productName: displayProduct,
      imageUrl: imgUrl,
      overallMatch: overall,
      ingredientMatch: ingMatch ? Number(ingMatch[1]) : null,
      attributeMatch: attrMatch ? Number(attrMatch[1]) : null,
      sharedIngredientsCount: sharedMatch ? Number(sharedMatch[1]) : null,
      rationale,
    });

    if (dupes.length >= 60) break;
  }

  return dupes;
}

export function parseSkinsortPage(
  html: string,
  fallbackBrandSlug: string,
  fallbackProductSlug: string,
): ParsedSkinsortPage | null {
  const dupes = parseDupeBlocks(html);
  // No-dupes pages are still valid products — but for our DB they're useless.
  // Require at least one dupe to consider the parse successful.
  if (dupes.length === 0) return null;

  const display = pickProductDisplay(html);
  const brandName =
    (display?.brand && display.brand.length > 0
      ? display.brand
      : fallbackBrandSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  const productName =
    display?.product ||
    fallbackProductSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const product: ParsedProduct = {
    brandSlug: slugify(brandName) || fallbackBrandSlug,
    productSlug: fallbackProductSlug, // trust the URL slug, not the title
    brandName,
    productName,
    category: null,
    imageUrl: pickOgImage(html),
    ingredientsCount: pickIngredientsCount(html),
    freeFrom: [],
    goodFor: [],
    contains: [],
  };

  // Override brand slug back to the URL slug if it doesn't match (slug is canonical).
  product.brandSlug = fallbackBrandSlug;

  return { product, dupes };
}

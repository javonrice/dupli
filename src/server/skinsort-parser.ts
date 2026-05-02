// Parses a SkinSort product page HTML into typed product + dupe records.
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

function pickTitle(html: string): { brand: string; product: string } | null {
  // Title format: "Brand Name - Product Name | SkinSort" (most common) or with " — "
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  const t = decodeEntities(m[1]).replace(/\s*\|\s*SkinSort.*$/i, "").trim();
  const sep = t.includes(" - ") ? " - " : t.includes(" — ") ? " — " : null;
  if (!sep) return null;
  const idx = t.indexOf(sep);
  return {
    brand: t.slice(0, idx).trim(),
    product: t.slice(idx + sep.length).trim(),
  };
}

function pickOgImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function pickCategory(html: string): string | null {
  // Category usually appears as a small breadcrumb / subtitle near the product name.
  // Fallback: look for "Category" label.
  const m = html.match(/Category[^<]*<[^>]+>\s*([^<]+)</i);
  return m ? decodeEntities(m[1]).trim() : null;
}

function pickTagList(html: string, label: "Free From" | "Good For" | "Contains"): string[] {
  // Tag sections are usually a heading followed by <a> or <span> chips.
  const re = new RegExp(
    `${label}[\\s\\S]{0,40}?<(?:ul|div)[^>]*>([\\s\\S]*?)</(?:ul|div)>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return [];
  const inner = m[1];
  const items = Array.from(inner.matchAll(/<(?:a|li|span)[^>]*>([^<]+)<\/(?:a|li|span)>/gi))
    .map((x) => decodeEntities(x[1]).trim().toLowerCase())
    .filter((x) => x && x.length < 60);
  return Array.from(new Set(items));
}

function pickIngredientsCount(html: string): number | null {
  // SkinSort shows e.g. "47 ingredients" or "Ingredients (47)"
  const m =
    html.match(/Ingredients?\s*\((\d+)\)/i) ||
    html.match(/(\d+)\s+ingredients?/i);
  return m ? Number(m[1]) : null;
}

function parseDupeBlocks(html: string): ParsedDupe[] {
  // SkinSort dupe pages list dupes as cards with a /products/<brand>/<slug> link
  // and a "NN%" overall match badge. We extract one entry per unique product link.
  const dupes: ParsedDupe[] = [];
  const seen = new Set<string>();

  // Find anchors to other product pages.
  const linkRe =
    /<a[^>]+href=["']\/products\/([^"'\/]+)\/([^"'\/?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const brandSlug = m[1];
    const productSlug = m[2];
    const key = `${brandSlug}/${productSlug}`;
    if (seen.has(key)) continue;
    // Skip the product's own link by checking whether a "%" badge appears nearby.
    const start = Math.max(0, m.index - 200);
    const end = Math.min(html.length, m.index + m[0].length + 600);
    const window = html.slice(start, end);
    const pctMatch = window.match(/(\d{1,3})\s*%/);
    if (!pctMatch) continue;
    const overall = Math.min(100, Math.max(0, Number(pctMatch[1])));
    if (overall <= 0 || overall > 100) continue;

    seen.add(key);

    const ingMatch = window.match(/(\d{1,3})\s*%\s*ingredients?/i);
    const attrMatch = window.match(/(\d{1,3})\s*%\s*attributes?/i);
    const sharedMatch = window.match(/(\d+)\s+shared\s+ingredients?/i);
    const imgMatch = window.match(/<img[^>]+src=["']([^"']+)["']/i);
    const altMatch = window.match(/<img[^>]+alt=["']([^"']+)["']/i);

    // Try to derive display brand+product from the alt text or anchor inner text.
    let displayBrand = "";
    let displayProduct = "";
    if (altMatch) {
      const alt = decodeEntities(altMatch[1]);
      const sep = alt.includes(" - ") ? " - " : alt.includes(" — ") ? " — " : null;
      if (sep) {
        const i = alt.indexOf(sep);
        displayBrand = alt.slice(0, i).trim();
        displayProduct = alt.slice(i + sep.length).trim();
      } else {
        displayProduct = alt.trim();
      }
    }
    if (!displayProduct) {
      displayProduct = stripTags(m[3]).slice(0, 200);
    }
    if (!displayBrand) {
      // Fallback: humanize the brand slug.
      displayBrand = brandSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!displayProduct) {
      displayProduct = productSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // Rationale: try to find a "Dupe Explained" / paragraph block near the card.
    const rationaleMatch =
      window.match(/Dupe Explained[\s\S]{0,40}?<p[^>]*>([\s\S]*?)<\/p>/i) ||
      window.match(/<p[^>]*class=["'][^"']*rationale[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const rationale = rationaleMatch ? stripTags(rationaleMatch[1]).slice(0, 1000) : null;

    dupes.push({
      rank: dupes.length + 1,
      brandSlug,
      productSlug,
      brandName: displayBrand,
      productName: displayProduct,
      imageUrl: imgMatch ? imgMatch[1] : null,
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
  const title = pickTitle(html);
  if (!title) return null;

  const brandName = title.brand;
  const productName = title.product;
  const brandSlug = slugify(brandName) || fallbackBrandSlug;
  const productSlug = slugify(productName) || fallbackProductSlug;

  const product: ParsedProduct = {
    brandSlug,
    productSlug,
    brandName,
    productName,
    category: pickCategory(html),
    imageUrl: pickOgImage(html),
    ingredientsCount: pickIngredientsCount(html),
    freeFrom: pickTagList(html, "Free From"),
    goodFor: pickTagList(html, "Good For"),
    contains: pickTagList(html, "Contains"),
  };

  // Dupes section: scope to the body to avoid header/nav links.
  const bodyStart = html.search(/Top Dupes|Dupes for|Similar products/i);
  const dupeHtml = bodyStart > 0 ? html.slice(bodyStart) : html;
  const dupes = parseDupeBlocks(dupeHtml);

  return { product, dupes };
}

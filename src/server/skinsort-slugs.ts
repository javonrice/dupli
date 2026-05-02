// Slug helpers for SkinSort URLs. Pure string ops, no I/O.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildSkinsortUrl(brand: string, product: string): string {
  return `https://skinsort.com/products/${slugify(brand)}/${slugify(product)}`;
}

export function buildSkinsortBrandUrl(brand: string): string {
  return `https://skinsort.com/brands/${slugify(brand)}`;
}

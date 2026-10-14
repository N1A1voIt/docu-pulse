export function slugify(base: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 10);
  const root = cleaned.length > 0 ? cleaned : "org";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${root}${suffix}`.slice(0, 16);
}

export function getCategories(items) {
  const unique = new Set(items.map((item) => item.category  || item["نوع التراث"] || "غير مصنف"));
  return [...unique].sort((a, b) => a.localeCompare(b, "ar"));
}

export function filterByCategories(items, selectedCategories) {
  if (!selectedCategories.size) return items;
  return items.filter((item) => selectedCategories.has(item.category || item["نوع التراث"] || "غير مصنف"));
}

export function searchItems(items, keyword) {
  const q = normalize(keyword);
  if (!q) return items;
  return items.filter((item) => {
    const name = normalize(item.name || "");
    const category = normalize(item.category || item["نوع التراث"] || "");
    if (name.includes(q) || category.includes(q)) return true;
    return levenshtein(name, q) <= 2 || levenshtein(category, q) <= 2;
  });
}

export function getCategoryCounts(items) {
  const counts = {};
  items.forEach((item) => {
    const key = item.category  || item["نوع التراث"] || "غير مصنف";
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

export function classifyHeritageType(category = "") {
  const normalized = normalize(category);
  if (normalized.includes("لامادي") || normalized.includes("غير مادي")) return "intangible";
  return "tangible";
}

export function filterByLayerVisibility(items, showTangible, showIntangible) {
  return items.filter((item) => {
    if (item.heritageType === "intangible") return showIntangible;
    return showTangible;
  });
}

export function getSuggestions(items, keyword, limit = 8) {
  const q = normalize(keyword);
  if (!q) return [];
  const scored = items
    .map((item) => {
      const name = normalize(item.name || "");
      const category = normalize(item.category || item["نوع التراث"] || "");
      const baseMatch = name.includes(q) || category.includes(q);
      const score = baseMatch ? 0 : Math.min(levenshtein(name, q), levenshtein(category, q)) + 2;
      return { item, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .filter((entry) => entry.score <= 4)
    .map((entry) => entry.item);
  return scored;
}

function normalize(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[b.length][a.length];
}

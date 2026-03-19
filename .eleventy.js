const fs = require("fs");
const path = require("path");

const DAILY_DIR = path.join(__dirname, "src", "_data", "daily");

function readReleaseFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { dateSlug: null, fetchedAt: null, items: [] };
  }
  if (Array.isArray(data)) {
    const base = path.basename(filePath, ".json");
    return { dateSlug: base, fetchedAt: null, items: data };
  }
  if (data && Array.isArray(data.items)) {
    return {
      dateSlug: data.dateSlug || data.date || path.basename(filePath, ".json"),
      fetchedAt: data.fetchedAt || null,
      items: data.items,
    };
  }
  return { dateSlug: null, fetchedAt: null, items: [] };
}

function readAllReleasePages() {
  if (!fs.existsSync(DAILY_DIR)) return [];
  return fs
    .readdirSync(DAILY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => readReleaseFile(path.join(DAILY_DIR, f)))
    .filter((p) => p.dateSlug)
    .sort((a, b) => b.dateSlug.localeCompare(a.dateSlug));
}

const SOURCE_ORDER = ["arXiv", "YC", "a16z", "G2", "Capterra"];

function groupSources(items) {
  const buckets = { arXiv: [], YC: [], a16z: [], G2: [], Capterra: [], other: [] };
  for (const it of items || []) {
    const s = it.source;
    if (SOURCE_ORDER.includes(s)) buckets[s].push(it);
    else buckets.other.push(it);
  }
  const out = [];
  for (const k of SOURCE_ORDER) {
    if (buckets[k].length) out.push({ key: k, items: buckets[k] });
  }
  if (buckets.other.length) out.push({ key: "other", items: buckets.other });
  return out;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addNunjucksFilter("groupSources", groupSources);

  eleventyConfig.addNunjucksFilter("sectionTitle", (key) => {
    const map = {
      arXiv: "arXiv",
      YC: "Y Combinator",
      a16z: "a16z (Future)",
      G2: "G2 Learn",
      Capterra: "Capterra",
      other: "Other",
    };
    return map[key] || key;
  });

  eleventyConfig.addGlobalData("releasesPages", () => readAllReleasePages());

  eleventyConfig.addGlobalData("latestRelease", () => {
    const pages = readAllReleasePages();
    return pages[0] || { dateSlug: null, items: [], fetchedAt: null };
  });

  return {
    dir: {
      input: "src",
      output: "docs",
      data: "_data",
      includes: "_includes",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};

#!/usr/bin/env node
/**
 * Fetches public feeds and writes src/_data/daily/YYYY-MM-DD.json
 * Items from the last 24 hours (by published/updated time), normalized.
 *
 * Env:
 *   TARGET_DATE=YYYY-MM-DD  — calendar day label for the output file (default: today UTC)
 *
 * Test ideas (manual):
 *   1) Run twice; dedupe should keep stable keys.
 *   2) Disconnect network; script should still write partial JSON and exit 0.
 *   3) Set TARGET_DATE to past day; file name should match.
 */

const fs = require("fs");
const path = require("path");
const { parseStringPromise } = require("xml2js");
const RssParser = require("rss-parser");

const UA =
  "releases-site/0.1 (+https://github.com/nikitarogers333/releases; local fetch)";

const FEEDS = {
  yc: "https://www.ycombinator.com/blog/feed",
  a16z: "https://future.com/feed",
  g2: "https://learn.g2.com/rss.xml",
  capterra: "https://www.capterra.com/blog/feed/",
};

const ARXIV_URL =
  "https://export.arxiv.org/api/query?search_query=all&start=0&max_results=150&sortBy=lastUpdatedDate&sortOrder=descending";

const root = path.join(__dirname, "..");
const dailyDir = path.join(root, "_data", "daily");

function utcDayString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function hoursAgo(h) {
  return Date.now() - h * 60 * 60 * 1000;
}

async function fetchText(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, text };
    return { ok: true, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: e };
  } finally {
    clearTimeout(t);
  }
}

function stripHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n = 400) {
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function inLast24h(isoOrDate) {
  if (!isoOrDate) return false;
  const t = new Date(isoOrDate).getTime();
  if (Number.isNaN(t)) return false;
  return t >= hoursAgo(24);
}

async function parseArxivAtom(xml) {
  const parsed = await parseStringPromise(xml);
  const entries = parsed?.feed?.entry;
  if (!entries) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  const out = [];
  for (const e of list) {
    const title = (e.title && (Array.isArray(e.title) ? e.title[0] : e.title)) || "";
    const id = (e.id && (Array.isArray(e.id) ? e.id[0] : e.id)) || "";
    const summaryRaw =
      (e.summary && (Array.isArray(e.summary) ? e.summary[0] : e.summary)) || "";
    const updated =
      (e.updated && (Array.isArray(e.updated) ? e.updated[0] : e.updated)) ||
      (e.published && (Array.isArray(e.published) ? e.published[0] : e.published)) ||
      "";
    const url = id.startsWith("http") ? id : "";
    if (!inLast24h(updated)) continue;
    out.push({
      title: stripHtml(title),
      url: url || "https://arxiv.org",
      source: "arXiv",
      date: utcDayString(),
      publishedAt: updated,
      summary: truncate(stripHtml(summaryRaw)),
    });
  }
  return out;
}

async function parseRssXml(xml, sourceLabel) {
  const parser = new RssParser();
  const feed = await parser.parseString(xml);
  const out = [];
  for (const it of feed.items || []) {
    const pub = it.pubDate || it.isoDate || "";
    if (!inLast24h(pub)) continue;
    const link = it.link || it.guid || "";
    if (!link) continue;
    out.push({
      title: stripHtml(it.title || "Untitled"),
      url: link,
      source: sourceLabel,
      date: utcDayString(),
      publishedAt: pub,
      summary: truncate(stripHtml(it.contentSnippet || it.summary || it.content || "")),
    });
  }
  return out;
}

function dedupe(items) {
  const seen = new Set();
  const res = [];
  for (const it of items) {
    const key = `${it.source}|${it.url}|${it.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(it);
  }
  return res;
}

async function run() {
  const dayLabel = process.env.TARGET_DATE || utcDayString();
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });

  const items = [];

  const arxiv = await fetchText(ARXIV_URL);
  if (arxiv.ok) {
    try {
      items.push(...(await parseArxivAtom(arxiv.text)));
    } catch (e) {
      console.error("arXiv parse error:", e.message);
    }
  } else {
    console.warn("arXiv fetch failed:", arxiv.status, arxiv.error?.message || "");
  }

  const rssJobs = [
    ["YC", FEEDS.yc],
    ["a16z", FEEDS.a16z],
    ["G2", FEEDS.g2],
    ["Capterra", FEEDS.capterra],
  ];

  for (const [label, url] of rssJobs) {
    const res = await fetchText(url);
    if (!res.ok) {
      console.warn(`${label} fetch failed:`, res.status, res.error?.message || "");
      continue;
    }
    try {
      items.push(...(await parseRssXml(res.text, label)));
    } catch (e) {
      console.error(`${label} parse error:`, e.message);
    }
  }

  const normalized = dedupe(items).sort((a, b) => {
    const ta = new Date(a.publishedAt || 0).getTime();
    const tb = new Date(b.publishedAt || 0).getTime();
    return tb - ta;
  });

  const payload = {
    dateSlug: dayLabel,
    fetchedAt: new Date().toISOString(),
    items: normalized,
  };

  const outPath = path.join(dailyDir, `${dayLabel}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${outPath} (${normalized.length} items)`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

import * as cheerio from "cheerio";

export type WebSearchResult =
  | { results: Array<{ title: string; url: string; snippet: string }>; note?: string };
export type WebFetchResult =
  | { url: string; contentType: "text/html"; text: string }
  | { url: string; error: string };

function getTimeoutMs(): number {
  const s = parseInt(process.env.WEB_TIMEOUT || "15", 10);
  return Number.isFinite(s) ? s * 1000 : 15000;
}

export async function webSearch(query: string): Promise<WebSearchResult> {
  if (!query) return { results: [], note: "empty query" };
  const backend = process.env.WEB_SEARCH_BACKEND || "duckduckgo";
  switch (backend) {
    case "duckduckgo": {
      const { searchDuckDuckGo } = await import("./web-backends/duckduckgo.js");
      return searchDuckDuckGo(query, getTimeoutMs());
    }
    default:
      return { results: [], note: `unknown backend: ${backend}` };
  }
}

export async function webFetch(url: string): Promise<WebFetchResult> {
  if (!url) return { url: "", error: "empty url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return { url, error: `http ${resp.status}` };
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("html")) return { url, error: `non-html: ${contentType}` };
    const html = await resp.text();
    const text = stripHtml(html);
    return { url, contentType: "text/html", text };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { url, error: msg };
  }
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

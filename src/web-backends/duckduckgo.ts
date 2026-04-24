import * as cheerio from "cheerio";

export type SearchResult = { title: string; url: string; snippet: string };
export type WebSearchResult = { results: SearchResult[]; note?: string };

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const MAX_RESULTS = 10;

export async function searchDuckDuckGo(
  query: string,
  timeoutMs: number,
): Promise<WebSearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(DDG_HTML_URL + "?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": "turing-agent-workflows/0.1 (+research)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { results: [], note: `duckduckgo http ${resp.status}` };
    const html = await resp.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    $(".result").each((_, el) => {
      if (results.length >= MAX_RESULTS) return false;
      const title = $(el).find(".result__title").text().trim();
      const url =
        $(el).find(".result__url").attr("href") ||
        $(el).find(".result__title a").attr("href") ||
        "";
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && url) results.push({ title, url, snippet });
    });
    if (results.length === 0) return { results: [], note: "no results" };
    return { results };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { results: [], note: `duckduckgo error: ${msg}` };
  }
}

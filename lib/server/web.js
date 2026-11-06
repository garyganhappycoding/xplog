// Web search for the assistant, via Tavily (a search API built for AI assistants).
// Needs TAVILY_API_KEY. Results are trimmed to a title, address and short snippet.

export const hasWebSearch = () => !!process.env.TAVILY_API_KEY;

const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// -> [{ title, url, snippet }]  (throws a readable error if the search fails)
export async function webSearch(query, { maxResults = 5, fetchImpl = fetch } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("Web search is not set up (TAVILY_API_KEY is missing).");
  const q = String(query || "").trim().slice(0, 300);
  if (!q) throw new Error("Empty search query.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: q, max_results: maxResults, search_depth: "basic", include_answer: false, include_raw_content: false }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail?.error || data.error || data.message || `Search failed (${res.status})`);
    return (data.results || []).slice(0, maxResults).map((r) => ({
      title: clip(r.title, 140) || r.url,
      url: String(r.url || ""),
      snippet: clip(r.content, 450),
    }));
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The web search timed out.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

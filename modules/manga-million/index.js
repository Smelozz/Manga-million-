const BASE = "https://mangamillion.shueisha.co.jp";

async function getJSON(url) {
  const res = await fetchv2(url, {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res || res.status < 200 || res.status >= 300) {
    throw new Error(`MANGA MILLION request failed: ${url}`);
  }

  return res.text();
}

function absoluteURL(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return new URL(url, BASE).toString();
}

function makeID(href) {
  return absoluteURL(href);
}

async function searchResults(query, page = 1) {
  if (!query || !query.trim()) {
    return {
      items: [],
      hasMore: false
    };
  }

  const url =
    `${BASE}/en/search?keyword=${encodeURIComponent(query.trim())}`;

  const html = await getJSON(url);

  // Intentionally conservative until the site's live HTML structure
  // has been captured and fixture-tested.
  return {
    items: [],
    hasMore: false,
    sourceURL: url,
    observed: html.length > 0
  };
}

async function extractDetails(itemID) {
  const url = absoluteURL(itemID);
  const html = await getJSON(url);

  return {
    id: url,
    href: url,
    title: "",
    description: "",
    cover: null,
    author: null,
    status: null,
    tags: [],
    observed: html.length > 0
  };
}

async function extractChapters(itemID) {
  // Chapter/image endpoints have not been verified yet.
  return [];
}

async function extractImages(chapterID) {
  // Image endpoints have not been verified yet.
  return [];
}

globalThis.SynthetiqModule = {
  searchResults,
  extractDetails,
  extractChapters,
  extractImages
};

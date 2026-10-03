"use strict";

const BASE = "https://mangamillion.shueisha.co.jp";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en",
  Referer: BASE + "/en/"
};

async function getHTML(url) {
  const response = await fetchv2(
    url,
    HEADERS,
    "GET",
    null,
    {
      followRedirects: true,
      maxBytesHint: 4194304,
      responseClass: "html"
    }
  );

  if (!response || !response.ok || response.bodyDropped) {
    throw new Error("MANGA MILLION request failed.");
  }

  const html =
    typeof response.text === "function"
      ? await response.text()
      : String(response.body || "");

  return {
    html,
    url: response.finalUrl || url
  };
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    );
}

function clean(value) {
  return decode(
    String(value || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function absolute(value, base) {
  try {
    return new URL(decode(value), base || BASE).toString();
  } catch (_) {
    return "";
  }
}

function getAttr(tag, name) {
  const match = String(tag).match(
    new RegExp(
      "\\b" +
        name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "\\s*=\\s*['\"]([^'\"]+)['\"]",
      "i"
    )
  );

  return match ? decode(match[1]) : "";
}

function getMeta(html, attribute, value) {
  const match = String(html).match(
    new RegExp(
      "<meta\\b(?=[^>]*\\b" +
        attribute +
        "=['\"]" +
        value +
        "['\"])[^>]*>",
      "i"
    )
  );

  return match ? getAttr(match[0], "content") : "";
}

function titleFromURL(url) {
  const part =
    url.split("/").filter(Boolean).pop() || "Manga";

  return part.replace(/[-_]+/g, " ");
}

function parseSearch(html, pageURL) {
  const results = [];
  const seen = new Set();

  const linkRE =
    /<a\b[^>]*href\s*=\s*['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = linkRE.exec(html))) {
    const href = absolute(match[1], pageURL);

    if (!href.startsWith(BASE + "/en/")) continue;

    if (
      /\/(search|manga-list|featured)(\/|\?|#|$)/i.test(href)
    ) {
      continue;
    }

    const inner = match[2];

    const img =
      (inner.match(/<img\b[^>]*>/i) || [])[0] || "";

    const heading =
      (inner.match(
        /<(h[1-6]|p|span)\b[^>]*>([\s\S]*?)<\/\1>/i
      ) || [])[2] || "";

    const title =
      clean(heading) ||
      getAttr(img, "alt") ||
      getAttr(img, "title");

    if (!title || title.length < 2 || seen.has(href)) {
      continue;
    }

    const cover = absolute(
      getAttr(img, "data-src") ||
        getAttr(img, "src"),
      pageURL
    );

    const item = {
      id: href,
      href,
      title
    };

    if (cover.startsWith("https://")) {
      item.cover = cover;
    }

    results.push(item);
    seen.add(href);
  }

  return results;
}

function parseDetails(html, url) {
  const h1 =
    (html.match(
      /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
    ) || [])[1] || "";

  const title =
    clean(
      getMeta(html, "property", "og:title") ||
        getMeta(html, "name", "title") ||
        h1
    ) || titleFromURL(url);

  const description = clean(
    getMeta(html, "name", "description") ||
      getMeta(html, "property", "og:description")
  );

  const cover = absolute(
    getMeta(html, "property", "og:image"),
    url
  );

  const result = {
    id: url,
    href: url,
    title
  };

  if (description) {
    result.description = description;
  }

  if (cover.startsWith("https://")) {
    result.cover = cover;
  }

  return result;
}

function parseChapters(html, pageURL) {
  const chapters = [];
  const seen = new Set();

  const linkRE =
    /<a\b[^>]*href\s*=\s*['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = linkRE.exec(html))) {
    const href = absolute(match[1], pageURL);
    const label = clean(match[2]);

    if (!href.startsWith(BASE + "/en/")) continue;
    if (!label) continue;

    if (
      !/\b(chapter|ch\.?\s*\d+)/i.test(label)
    ) {
      continue;
    }

    if (seen.has(href)) continue;

    chapters.push({
      id: href,
      href,
      title: label,
      language: "en"
    });

    seen.add(href);
  }

  return chapters;
}

function parseImages(html, pageURL) {
  const images = [];
  const seen = new Set();

  const imageRE = /<img\b[^>]*>/gi;

  let match;

  while ((match = imageRE.exec(html))) {
    const tag = match[0];

    const src = absolute(
      getAttr(tag, "data-src") ||
        getAttr(tag, "src"),
      pageURL
    );

    if (!src.startsWith("https://")) continue;
    if (seen.has(src)) continue;

    if (
      !/\.(jpg|jpeg|png|webp|avif)(?:[?#]|$)/i.test(src)
    ) {
      continue;
    }

    if (
      /(logo|icon|avatar|sprite|banner)/i.test(src)
    ) {
      continue;
    }

    images.push({
      url: src
    });

    seen.add(src);
  }

  return images;
}

async function searchResults(query, page = 1) {
  const q = String(query || "").trim();

  if (!q) {
    return {
      items: [],
      hasMore: false
    };
  }

  const url =
    BASE +
    "/en/search?keyword=" +
    encodeURIComponent(q) +
    (Number(page) > 1
      ? "&page=" + encodeURIComponent(page)
      : "");

  const result = await getHTML(url);

  return {
    items: parseSearch(result.html, result.url),
    hasMore: false
  };
}

async function extractDetails(id) {
  const url = absolute(id);

  if (!url.startsWith(BASE + "/")) {
    throw new Error("Invalid MANGA MILLION URL.");
  }

  const result = await getHTML(url);

  return parseDetails(result.html, result.url);
}

async function extractChapters(id) {
  const url = absolute(id);

  if (!url.startsWith(BASE + "/")) {
    throw new Error("Invalid MANGA MILLION URL.");
  }

  const result = await getHTML(url);
  const chapters = parseChapters(result.html, result.url);

  if (!chapters.length) {
    throw new Error(
      "No public chapter links were found."
    );
  }

  return chapters;
}

async function extractImages(chapterID) {
  const url = absolute(chapterID);

  if (!url.startsWith(BASE + "/")) {
    throw new Error("Invalid MANGA MILLION URL.");
  }

  const result = await getHTML(url);
  const images = parseImages(result.html, result.url);

  if (!images.length) {
    throw new Error(
      "No public page images were found."
    );
  }

  return images;
}

const handlers = {
  searchResults,
  extractDetails,
  extractChapters,
  extractImages
};

globalThis.SynthetiqModule = handlers;
Object.assign(globalThis, handlers);

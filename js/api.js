/**
 * Assassin's Creed Fandom Wiki — MediaWiki Action API client
 * Base: https://assassinscreed.fandom.com/api.php
 */

const FANDOM_API = "https://assassinscreed.fandom.com/api.php";
const WIKI_BASE = "https://assassinscreed.fandom.com/wiki/";

const SKIP_SECTIONS = new Set([
  "gallery",
  "references",
  "see also",
  "external links",
  "notes",
  "trivia",
  "appearances",
  "sources",
  "navboxes",
  "technical information",
  "historical information",
]);

export const CATEGORIES = {
  individuals: "Category:Individuals",
  isu: "Category:Isu",
  isuTech: "Category:Isu technology",
  piecesOfEden: "Category:Pieces of Eden",
  comics: "Category:Real world comics",
  novels: "Category:Real world novels",
  games: "Category:Real world video games",
  assassins: "Category:Assassins",
  templars: "Category:Templars",
  levantines: "Category:Levantine Assassins",
  italians: "Category:Italian Assassins",
  colonials: "Category:Colonial Assassins",
  caribbean: "Category:Caribbean Assassins",
  egyptians: "Category:Egyptian Assassins",
  greeks: "Category:Greek Assassins",
  french: "Category:French Assassins",
  british: "Category:British Assassins",
  japanese: "Category:Japanese Assassins",
  ottomans: "Category:Ottoman Assassins",
  pirates: "Category:Pirates",
  norse: "Category:Norse people",
  mentors: "Category:Mentors",
  masters: "Category:Master Assassins",
};

function buildUrl(params) {
  const url = new URL(FANDOM_API);
  Object.entries({ format: "json", origin: "*", ...params }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return url.toString();
}

async function fandomFetch(params) {
  const res = await fetch(buildUrl(params), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Fandom API ${res.status}`);
  return res.json();
}

export function wikiUrl(title) {
  return WIKI_BASE + encodeURIComponent(title.replace(/ /g, "_"));
}

export async function openSearch(query, limit = 10) {
  if (!query?.trim()) return [];
  const data = await fandomFetch({
    action: "opensearch",
    search: query.trim(),
    limit: String(limit),
    namespace: "0",
  });
  const [, titles = [], , urls = []] = data;
  return titles.map((title, i) => ({ title, url: urls[i] }));
}

export async function searchWiki(query, limit = 24) {
  const data = await fandomFetch({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(limit),
    srnamespace: "0",
  });
  return data.query?.search ?? [];
}

export async function listCategory(cmtitle, { limit = 24, continueToken = null, namespace = "0" } = {}) {
  const params = {
    action: "query",
    list: "categorymembers",
    cmtitle,
    cmlimit: String(limit),
    cmnamespace: namespace,
  };

  const token =
    typeof continueToken === "string"
      ? continueToken
      : continueToken && continueToken.cmcontinue
        ? continueToken.cmcontinue
        : null;

  if (token) params.cmcontinue = token;

  const data = await fandomFetch(params);
  return {
    items: data.query?.categorymembers ?? [],
    next: data.continue?.cmcontinue ?? null,
    // alias kept for older callers
    continue: data.continue?.cmcontinue ?? null,
  };
}

/** Images only — fast hydration for grids */
export async function getPageImages(titles) {
  const list = Array.isArray(titles) ? titles : [titles];
  if (!list.length) return [];

  const data = await fandomFetch({
    action: "query",
    prop: "pageimages|info",
    titles: list.join("|"),
    redirects: "1",
    piprop: "thumbnail",
    pithumbsize: "480",
    inprop: "url",
  });

  const aliasToFinal = new Map();
  (data.query?.normalized || []).forEach((n) => aliasToFinal.set(n.from, n.to));
  (data.query?.redirects || []).forEach((r) => {
    aliasToFinal.set(r.from, r.to);
  });

  return Object.values(data.query?.pages ?? {})
    .filter((p) => !p.missing)
    .map((page) => ({
      pageid: page.pageid,
      title: page.title,
      url: page.fullurl || wikiUrl(page.title),
      image: page.thumbnail?.source ?? null,
      summary: null,
      aliases: [...aliasToFinal.entries()].filter(([, to]) => to === page.title).map(([from]) => from),
    }));
}

/** Lightweight details for cards (image + short clean summary) */
export async function getPagesDetails(titles) {
  const list = Array.isArray(titles) ? titles : [titles];
  if (!list.length) return [];

  const data = await fandomFetch({
    action: "query",
    prop: "pageimages|revisions|info",
    titles: list.join("|"),
    redirects: "1",
    piprop: "thumbnail",
    pithumbsize: "480",
    rvprop: "content",
    rvslots: "main",
    inprop: "url",
  });

  const aliasToFinal = new Map();
  (data.query?.normalized || []).forEach((n) => aliasToFinal.set(n.from, n.to));
  (data.query?.redirects || []).forEach((r) => {
    const from = aliasToFinal.get(r.from) || r.from;
    aliasToFinal.set(r.from, r.to);
    aliasToFinal.set(from, r.to);
  });

  const pages = Object.values(data.query?.pages ?? {}).filter((p) => !p.missing);
  return pages.map((page) => {
    const normalized = normalizePage(page);
    const aliases = [...aliasToFinal.entries()]
      .filter(([, to]) => to === page.title)
      .map(([from]) => from);
    return { ...normalized, aliases };
  });
}

function normalizePage(page) {
  const wikitext =
    page.revisions?.[0]?.slots?.main?.["*"] ??
    page.revisions?.[0]?.["*"] ??
    "";
  return {
    pageid: page.pageid,
    title: page.title,
    url: page.fullurl || wikiUrl(page.title),
    image: page.thumbnail?.source ?? null,
    summary: extractSummary(wikitext),
    quote: extractQuote(wikitext),
  };
}

/**
 * Full readable article for the drawer — uses MediaWiki parse (HTML),
 * then extracts lead + meaningful sections (skips gallery/refs/infobox noise).
 */
export async function getReadableArticle(title, depth = 0) {
  const resolved = await resolveTitle(title);
  const pageTitle = resolved || title;

  const [parseData, meta] = await Promise.all([
    fandomFetch({
      action: "parse",
      page: pageTitle,
      prop: "text|sections",
      disabletoc: "1",
      disableeditsection: "1",
      redirects: "1",
    }),
    fandomFetch({
      action: "query",
      prop: "pageimages|info",
      titles: pageTitle,
      redirects: "1",
      piprop: "thumbnail",
      pithumbsize: "800",
      inprop: "url",
    }),
  ]);

  if (parseData.error) {
    throw new Error(parseData.error.info || parseData.error.code || "parse failed");
  }

  const page = Object.values(meta.query?.pages ?? {})[0] || {};
  let html = parseData.parse?.text?.["*"] || "";
  let finalTitle = parseData.parse?.title || pageTitle;

  // Redirect stub — resolve and retry once
  if (/redirectMsg|Redirect to:/i.test(html) && depth < 2) {
    const target =
      html.match(/title="([^"]+)"[^>]*>\s*[^<]+<\/a>/i)?.[1] ||
      html.match(/Redirect to:[\s\S]*?title="([^"]+)"/i)?.[1];
    if (target && target !== pageTitle) {
      return getReadableArticle(target, depth + 1);
    }
  }

  const article = htmlToArticle(html, finalTitle);

  // If HTML yielded nothing useful, fall back to wikitext lead
  if (!article.bodyHtml || /Conteúdo indisponível/i.test(article.bodyHtml)) {
    const fromWiki = await articleFromWikitext(finalTitle);
    if (fromWiki) {
      article.summary = fromWiki.summary || article.summary;
      article.bodyHtml = fromWiki.bodyHtml;
      if (fromWiki.image) article.leadImage = fromWiki.image;
    }
  }

  return {
    pageid: page.pageid || parseData.parse?.pageid,
    title: finalTitle,
    url: page.fullurl || wikiUrl(finalTitle),
    image: page.thumbnail?.source || article.leadImage || null,
    quote: article.quote,
    summary: article.summary,
    sections: article.sections,
    bodyHtml: article.bodyHtml,
  };
}

async function articleFromWikitext(title) {
  try {
    const data = await fandomFetch({
      action: "query",
      prop: "revisions|pageimages|info",
      titles: title,
      redirects: "1",
      rvprop: "content",
      rvslots: "main",
      piprop: "thumbnail",
      pithumbsize: "800",
      inprop: "url",
    });
    const page = Object.values(data.query?.pages ?? {})[0];
    if (!page || page.missing) return null;
    const wikitext =
      page.revisions?.[0]?.slots?.main?.["*"] ??
      page.revisions?.[0]?.["*"] ??
      "";
    if (!wikitext.trim() || /^#\s*redirect/i.test(wikitext.trim())) return null;

    const summary = extractSummary(wikitext);
    // Build a few lead paragraphs from wikitext before first heading
    let lead = wikitext.split(/\n==+[^=]/g)[0] || wikitext;
    lead = stripTemplates(lead)
      .replace(/\[\[File:[^\]]+\]\]/gi, "")
      .replace(/^\|.*$/gm, "");
    const paras = lead
      .split(/\n{2,}/)
      .map((p) => stripInlineWiki(p))
      .map((p) =>
        p
          .replace(/(?:^|\s)\|[a-z0-9_\s]*=\s*/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter((p) => p.length > 50)
      .filter((p) => !/out of date|need of a revamp|pre-release/i.test(p))
      .slice(0, 5);

    if (!paras.length && !summary) return null;

    const body =
      paras.map((p) => `<p class="prose__p">${escapeHtml(p)}</p>`).join("") ||
      `<p class="prose__p">${escapeHtml(summary)}</p>`;

    return {
      summary: summary || paras[0],
      bodyHtml: body,
      image: page.thumbnail?.source || null,
    };
  } catch {
    return null;
  }
}

/** Resolve redirects / normalization to the canonical article title */
async function resolveTitle(title) {
  const data = await fandomFetch({
    action: "query",
    titles: title,
    redirects: "1",
    prop: "info",
  });
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page || page.missing) {
    // try search
    const hits = await searchWiki(title, 1);
    return hits[0]?.title || null;
  }
  return page.title;
}

function extractQuote(wikitext) {
  const m = wikitext.match(/\{\{Quote\|([^|}]+)/i);
  return m ? stripInlineWiki(m[1]) : null;
}

/** Nested {{template}} remover */
function stripTemplates(wikitext) {
  let out = "";
  let i = 0;
  while (i < wikitext.length) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      let depth = 0;
      let j = i;
      while (j < wikitext.length) {
        if (wikitext[j] === "{" && wikitext[j + 1] === "{") {
          depth++;
          j += 2;
          continue;
        }
        if (wikitext[j] === "}" && wikitext[j + 1] === "}") {
          depth--;
          j += 2;
          if (depth === 0) break;
          continue;
        }
        j++;
      }
      out += " ";
      i = j;
      continue;
    }
    out += wikitext[i];
    i++;
  }
  return out;
}

function stripInlineWiki(s) {
  return decodeBasicEntities(String(s))
    .replace(/\[\[File:[^\]]+\]\]/gi, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]+\]/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&lrm;|&rlm;/gi, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractSummary(wikitext) {
  if (!wikitext?.trim()) return null;

  if (/^#\s*redirect/i.test(wikitext.trim())) return null;
  if (/\{\{\s*disambig/i.test(wikitext) || /\bmay refer to:/i.test(wikitext)) return null;

  // Lead only: everything before the first == heading
  let lead = wikitext.split(/\n==+[^=]/g)[0] || wikitext;
  lead = stripTemplates(lead);
  lead = lead
    .replace(/\[\[File:[^\]]+\]\]/gi, "")
    .replace(/^\|.*$/gm, "")
    .replace(/\{\|[\s\S]*?\|\}/g, " ")
    .replace(/^\*\s*.+$/gm, " "); // drop list leftovers from bad pages

  let text = stripInlineWiki(lead);
  text = text
    .replace(/(?:^|\s)\|[a-z0-9_\s]*=\s*/gi, " ")
    .replace(/\}\}/g, " ")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^>]*\/?\s*>/gi, "")
    // Clean noisy native-script / empty-label parentheticals on cards
    .replace(/\(\s*(?:Arabic|Chinese|Japanese|Greek|Egyptian|Latin|Old Norse)[^)]*\)/gi, "")
    .replace(/\(\s*:\s*[^)]*\)/g, "")
    .replace(/\([^)]*[\u3040-\u30ff\u3400-\u9fff\u16A0-\u16FF\u0600-\u06FF][^)]*\)/g, "")
    .replace(/\(\s*;\s*/g, "(")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length < 40) return null;
  if (/^#\s*redirect/i.test(text) || /\bmay refer to\b/i.test(text)) return null;

  if (text.length > 220) text = text.slice(0, 220).replace(/\s+\S*$/, "") + "…";
  return text;
}

function decodeEntities(text) {
  return decodeBasicEntities(String(text));
}

function cleanText(nodeText) {
  return decodeEntities(nodeText)
    .replace(/\[[\d]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToArticle(html, title) {
  const root = document.createElement("div");
  root.innerHTML = html;

  if (root.querySelector(".redirectMsg")) {
    return {
      summary: "Sem resumo disponível.",
      quote: null,
      sections: [],
      leadImage: null,
      bodyHtml: `<p class="prose__p">Conteúdo indisponível.</p>`,
    };
  }

  root.querySelectorAll(
    "script, style, table, .navbox, .infobox, .portable-infobox, .reference, .mw-editsection, .noprint, .thumb, figure, .gallery, .toc, .hatnote, .metadata, noscript, .ass-nav, .page-header"
  ).forEach((n) => n.remove());

  const blocks = [];
  let current = { title: null, paragraphs: [], dialogue: [] };

  const pushCurrent = () => {
    if (current.paragraphs.length || current.dialogue.length) {
      blocks.push(current);
    }
    current = { title: null, paragraphs: [], dialogue: [] };
  };

  const walk = root.querySelector(".mw-parser-output") || root;

  const visit = (el) => {
    if (!el || el.nodeType !== 1) return;
    const tag = el.tagName;

    if (/^H[2-4]$/.test(tag)) {
      pushCurrent();
      const heading = cleanText(el.textContent).replace(/\[\s*editar\s*\]/gi, "").trim();
      current.title = heading;
      return;
    }

    if (tag === "P") {
      const t = cleanText(el.textContent);
      // Skip maintenance banners
      if (
        t &&
        t.length > 1 &&
        !/out of date|need of a revamp|pre-release sources|improve it in any way/i.test(t)
      ) {
        current.paragraphs.push(t);
      }
      return;
    }

    if (tag === "UL" || tag === "DL") {
      el.querySelectorAll(":scope > li, :scope > dd").forEach((li) => {
        const t = cleanText(li.textContent);
        if (!t || t.length < 8) return;
        if (current.title?.toLowerCase().includes("dialogue")) {
          current.dialogue.push(t);
        } else {
          current.paragraphs.push(t);
        }
      });
      return;
    }

    // Recurse into wrappers (Fandom often nests content in divs)
    if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
      [...el.children].forEach(visit);
    }
  };

  [...walk.children].forEach(visit);
  pushCurrent();

  const leadBlock = blocks.find((b) => !b.title) || { paragraphs: [] };
  const summary =
    leadBlock.paragraphs.find((p) => p.length > 60) ||
    leadBlock.paragraphs[0] ||
    blocks.find((b) => b.title?.toLowerCase() === "description")?.paragraphs.find((p) => p.length > 40) ||
    blocks.find((b) => b.paragraphs.some((p) => p.length > 60))?.paragraphs.find((p) => p.length > 60) ||
    "Sem resumo disponível.";

  const sections = blocks
    .filter((b) => b.title)
    .filter((b) => !SKIP_SECTIONS.has(b.title.toLowerCase()))
    .filter((b) => b.title.toLowerCase() !== title.toLowerCase())
    .map((b) => ({
      title: b.title,
      paragraphs: b.paragraphs.slice(0, 8),
      dialogue: b.dialogue.slice(0, 12),
    }))
    .filter((b) => b.paragraphs.length || b.dialogue.length)
    .slice(0, 10);

  const leadParagraphs =
    leadBlock.paragraphs.length > 0
      ? leadBlock.paragraphs.slice(0, 4)
      : summary && summary !== "Sem resumo disponível."
        ? [summary]
        : [];

  const bodyHtml = renderSectionsHtml(leadParagraphs, sections);

  return {
    summary: summary.length > 320 ? summary.slice(0, 320).replace(/\s+\S*$/, "") + "…" : summary,
    quote: null,
    sections,
    leadImage: null,
    bodyHtml,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSectionsHtml(leadParagraphs, sections) {
  const parts = [];

  leadParagraphs.forEach((p) => {
    parts.push(`<p class="prose__p">${escapeHtml(p)}</p>`);
  });

  sections.forEach((sec) => {
    parts.push(`<h3 class="prose__h">${escapeHtml(sec.title)}</h3>`);
    sec.paragraphs.forEach((p) => {
      parts.push(`<p class="prose__p">${escapeHtml(p)}</p>`);
    });
    if (sec.dialogue.length) {
      parts.push(`<div class="prose__dialogue">`);
      sec.dialogue.forEach((line) => {
        const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
        if (m) {
          parts.push(
            `<p class="prose__line"><span class="prose__speaker">${escapeHtml(m[1])}</span> ${escapeHtml(m[2])}</p>`
          );
        } else {
          parts.push(`<p class="prose__line">${escapeHtml(line)}</p>`);
        }
      });
      parts.push(`</div>`);
    }
  });

  return parts.join("") || `<p class="prose__p">Conteúdo indisponível.</p>`;
}

/**
 * Optional external APIs (not used in the UI — Fandom covers the site).
 */
export async function searchComicVine() {
  return { results: [] };
}

export async function searchIgdb() {
  return { results: [] };
}

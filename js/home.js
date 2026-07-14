import { initNav, initReveal, createDrawer, escapeHtml, openArticleDrawer } from "./ui.js";
import {
  initIntro,
  initCrestParallax,
  initTiltCards,
  initRailDrag,
  initRailControls,
  initMagnetic,
} from "./motion.js";
import { getPagesDetails, getPageImages } from "./api.js";
import { FEATURED_CHARACTERS, ARTIFACTS, MAIN_GAMES } from "./data.js";

initIntro();
initNav();
initCrestParallax();
initMagnetic();
initReveal();

const drawer = createDrawer();
const grid = document.getElementById("featured-grid");
const artifactGrid = document.getElementById("artifact-grid");
const gameRail = document.getElementById("games-rail");

const ICONS = {
  apple: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="13" r="7"/><path d="M12 6c0-2 1.5-3.5 3-4-1 2-.5 3.5-1 4"/><path d="M9 13h6M12 10v6"/></svg>`,
  sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14.5 4.5 L19.5 9.5 L10 19 H5 v-5 Z"/><path d="M12 8.5 L15.5 12"/></svg>`,
  staff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3 v18"/><circle cx="12" cy="5" r="2.5"/><path d="M9 9 h6"/></svg>`,
  shroud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 7c2-3 12-3 14 0v10c-2 3-12 3-14 0V7z"/><path d="M9 11h6M10 14h4"/></svg>`,
  animus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h8M8 14h5"/><circle cx="17" cy="14" r="1.2" fill="currentColor"/></svg>`,
  pieces: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.8 7.1 18.2l.9-5.5-4-3.9L9.5 8z"/></svg>`,
};

function indexPages(pages) {
  const map = new Map();
  pages.forEach((p) => {
    map.set(p.title, p);
    (p.aliases || []).forEach((alias) => map.set(alias, p));
  });
  return map;
}

function cardSummary(character, page) {
  const raw = page?.summary;
  if (raw && !/may refer to|#\s*redirect/i.test(raw)) return raw;
  return character.blurb;
}

function renderArtifacts() {
  if (!artifactGrid) return;
  artifactGrid.innerHTML = ARTIFACTS.map(
    (a, i) => `
    <button type="button" class="artifact reveal reveal-delay-${(i % 4) + 1}" data-title="${escapeHtml(a.title)}">
      <div class="artifact__icon">${ICONS[a.icon] || ICONS.pieces}</div>
      <p class="artifact__meta">${escapeHtml(a.kind)}</p>
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.blurb)}</p>
    </button>`
  ).join("");

  artifactGrid.querySelectorAll(".artifact").forEach((btn) => {
    btn.addEventListener("click", () => openArticleDrawer(drawer, btn.dataset.title, {}));
  });

  initTiltCards(".artifact");
  initReveal();
}

async function renderGameRail() {
  if (!gameRail) return;
  const games = MAIN_GAMES;
  gameRail.innerHTML = games
    .map(
      (g) => `
    <button type="button" class="rail__card" data-title="${escapeHtml(g.title)}">
      <div class="rail__media" data-media="${escapeHtml(g.title)}"></div>
      <div class="rail__body">
        <p class="rail__meta">${g.year} · ${escapeHtml(g.era)}</p>
        <h3>${escapeHtml(g.title.replace("Assassin's Creed", "AC"))}</h3>
        <p>${escapeHtml(g.blurb)}</p>
      </div>
    </button>`
    )
    .join("");

  gameRail.querySelectorAll(".rail__card").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // ignore click if user was dragging
      if (gameRail.dataset.dragged === "1") {
        e.preventDefault();
        return;
      }
      openArticleDrawer(drawer, btn.dataset.title, {});
    });
  });

  initRailDrag("#games-rail");
  initRailControls("#games-rail");

  try {
    const pages = await getPageImages(games.map((g) => g.title));
    pages.forEach((p) => {
      const media = [...gameRail.querySelectorAll("[data-media]")].find(
        (el) => el.getAttribute("data-media") === p.title
      );
      if (media && p.image) media.innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadFeatured() {
  try {
    const titles = FEATURED_CHARACTERS.slice(0, 6).map((c) => c.title);
    const pages = await getPagesDetails(titles);
    const byTitle = indexPages(pages);

    grid.innerHTML = FEATURED_CHARACTERS.slice(0, 6)
      .map((c, i) => {
        const p = byTitle.get(c.title);
        const summary = cardSummary(c, p);
        return `
          <button type="button" class="tile reveal reveal-delay-${(i % 3) + 1}" data-title="${escapeHtml(p?.title || c.title)}">
            <div class="tile__media">${p?.image ? `<img src="${p.image}" alt="" loading="lazy">` : ""}</div>
            <div class="tile__body">
              <p class="tile__meta">${escapeHtml(c.era)} · ${escapeHtml(c.role)}</p>
              <h3 class="tile__title">${escapeHtml(p?.title || c.title)}</h3>
              <p class="tile__text">${escapeHtml(summary)}</p>
            </div>
          </button>`;
      })
      .join("");

    grid.querySelectorAll(".tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        openArticleDrawer(drawer, btn.dataset.title, byTitle.get(btn.dataset.title) || {});
      });
    });

    initReveal();
  } catch (err) {
    grid.innerHTML = `<p class="status status--error">Não foi possível carregar a Wiki agora.</p>`;
    console.error(err);
  }
}

renderArtifacts();
renderGameRail();
loadFeatured();

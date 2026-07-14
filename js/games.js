import { initNav, initReveal, createDrawer, escapeHtml, openArticleDrawer } from "./ui.js";
import { getPagesDetails } from "./api.js";
import { MAIN_GAMES } from "./data.js";

initNav();
initReveal();

const drawer = createDrawer();
const grid = document.getElementById("games-grid");
const input = document.getElementById("game-search");
const cache = new Map();

function render(list) {
  grid.innerHTML = list
    .map(
      (g) => `
    <button type="button" class="tile" data-title="${escapeHtml(g.title)}">
      <div class="tile__media" data-media="${escapeHtml(g.title)}"></div>
      <div class="tile__body">
        <p class="tile__meta">${g.year} · ${escapeHtml(g.era)}</p>
        <h3 class="tile__title">${escapeHtml(g.title)}</h3>
        <p class="tile__text">${escapeHtml(g.blurb)}</p>
      </div>
    </button>`
    )
    .join("");

  grid.querySelectorAll(".tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const title = btn.dataset.title;
      const curated = MAIN_GAMES.find((g) => g.title === title);
      openArticleDrawer(drawer, title, {
        ...(cache.get(title) || {}),
        summary: cache.get(title)?.summary || curated?.blurb,
      });
    });
  });

  enrichImages(list.map((g) => g.title));
}

async function enrichImages(titles) {
  try {
    for (let i = 0; i < titles.length; i += 8) {
      const chunk = titles.slice(i, i + 8);
      const pages = await getPagesDetails(chunk);
      pages.forEach((p) => {
        cache.set(p.title, p);
        const media = [...grid.querySelectorAll("[data-media]")].find(
          (el) => el.getAttribute("data-media") === p.title
        );
        if (media && p.image) media.innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
      });
    }
  } catch (err) {
    console.error(err);
  }
}

input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  const filtered = MAIN_GAMES.filter(
    (g) =>
      g.title.toLowerCase().includes(q) ||
      g.era.toLowerCase().includes(q) ||
      String(g.year).includes(q)
  );
  render(filtered);
});

render(MAIN_GAMES);

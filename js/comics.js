import { initNav, initReveal, createDrawer, escapeHtml, renderSkeletons, openArticleDrawer } from "./ui.js";
import { CATEGORIES, listCategory, getPagesDetails } from "./api.js";
import { COMICS_CURATED } from "./data.js";

initNav();
initReveal();

const drawer = createDrawer();
const grid = document.getElementById("hq-grid");
const moreBtn = document.getElementById("hq-more");

let mode = "curated";
let continueToken = null;
const cache = new Map();

function renderCurated() {
  moreBtn.hidden = true;
  continueToken = null;
  grid.innerHTML = COMICS_CURATED.map(
    (c) => `
    <button type="button" class="tile" data-title="${escapeHtml(c.title)}">
      <div class="tile__media"></div>
      <div class="tile__body">
        <p class="tile__meta">${escapeHtml(c.year)}</p>
        <h3 class="tile__title">${escapeHtml(c.title)}</h3>
        <p class="tile__text">${escapeHtml(c.blurb)}</p>
      </div>
    </button>`
  ).join("");
  bind();
  hydrate(COMICS_CURATED.map((c) => c.title));
}

async function renderWiki(cat, append = false) {
  if (!append) {
    renderSkeletons(grid, 6);
    continueToken = null;
  }
  try {
    const { items, continue: next } = await listCategory(cat, {
      limit: 18,
      continueToken: append ? continueToken : null,
    });
    continueToken = next;
    moreBtn.hidden = !next;

    const html = items
      .map(
        (it) => `
      <button type="button" class="tile" data-title="${escapeHtml(it.title)}">
        <div class="tile__media"></div>
        <div class="tile__body">
          <p class="tile__meta">Fandom Wiki</p>
          <h3 class="tile__title">${escapeHtml(it.title)}</h3>
          <p class="tile__text">Carregando resumo…</p>
        </div>
      </button>`
      )
      .join("");

    if (append) grid.insertAdjacentHTML("beforeend", html);
    else grid.innerHTML = html || `<p class="status">Categoria vazia.</p>`;
    bind();
    await hydrate(items.map((i) => i.title));
  } catch (err) {
    console.error(err);
    if (!append) grid.innerHTML = `<p class="status status--error">Falha ao listar a Wiki.</p>`;
  }
}

function bind() {
  grid.querySelectorAll(".tile").forEach((btn) => {
    btn.onclick = () => {
      const title = btn.dataset.title;
      const curated = COMICS_CURATED.find((c) => c.title === title);
      openArticleDrawer(drawer, title, {
        ...(cache.get(title) || {}),
        summary: cache.get(title)?.summary || curated?.blurb,
      });
    };
  });
}

async function hydrate(titles) {
  try {
    for (let i = 0; i < titles.length; i += 8) {
      const pages = await getPagesDetails(titles.slice(i, i + 8));
      pages.forEach((p) => {
        cache.set(p.title, p);
        const tile = [...grid.querySelectorAll(".tile")].find((t) => t.dataset.title === p.title);
        if (!tile) return;
        if (p.image) tile.querySelector(".tile__media").innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
        const text = tile.querySelector(".tile__text");
        if (text && p.summary) text.textContent = p.summary;
      });
    }
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("hq-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#hq-chips .chip").forEach((c) => c.classList.remove("is-active"));
  chip.classList.add("is-active");
  mode = chip.dataset.mode;
  if (mode === "curated") renderCurated();
  else if (mode === "wiki") renderWiki(CATEGORIES.comics);
  else renderWiki(CATEGORIES.novels);
});

moreBtn.addEventListener("click", () => {
  if (mode === "wiki") renderWiki(CATEGORIES.comics, true);
  if (mode === "novels") renderWiki(CATEGORIES.novels, true);
});

renderCurated();

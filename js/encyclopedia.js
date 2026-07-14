import { initNav, initReveal, createDrawer, escapeHtml, renderSkeletons, openArticleDrawer } from "./ui.js";
import { searchWiki, openSearch, getPagesDetails } from "./api.js";

initNav();
initReveal();

const drawer = createDrawer();
const input = document.getElementById("wiki-search");
const grid = document.getElementById("wiki-grid");
const status = document.getElementById("wiki-status");
const cache = new Map();
let timer = null;

async function search(query) {
  const q = query.trim();
  if (q.length < 2) {
    grid.innerHTML = `<p class="status" style="grid-column:1/-1">Digite ao menos 2 caracteres.</p>`;
    status.hidden = true;
    return;
  }

  renderSkeletons(grid, 6);
  status.hidden = false;
  status.textContent = "Consultando Fandom…";
  status.classList.remove("status--error");

  try {
    let results = await searchWiki(q, 18);
    if (!results.length) {
      const suggestions = await openSearch(q, 12);
      results = suggestions.map((s) => ({ title: s.title }));
    }

    if (!results.length) {
      grid.innerHTML = `<p class="status" style="grid-column:1/-1">Nenhum artigo para “${escapeHtml(q)}”.</p>`;
      status.hidden = true;
      return;
    }

    grid.innerHTML = results
      .map(
        (r) => `
      <button type="button" class="tile" data-title="${escapeHtml(r.title)}">
        <div class="tile__media"></div>
        <div class="tile__body">
          <p class="tile__meta">Artigo Wiki</p>
          <h3 class="tile__title">${escapeHtml(r.title)}</h3>
          <p class="tile__text">Abrindo resumo…</p>
        </div>
      </button>`
      )
      .join("");

    grid.querySelectorAll(".tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        openArticleDrawer(drawer, btn.dataset.title, cache.get(btn.dataset.title) || {});
      });
    });

    status.textContent = `${results.length} resultados`;
    await hydrate(results.map((r) => r.title));
  } catch (err) {
    console.error(err);
    grid.innerHTML = "";
    status.hidden = false;
    status.classList.add("status--error");
    status.textContent = "A Wiki não respondeu. Tente novamente.";
  }
}

async function hydrate(titles) {
  for (let i = 0; i < titles.length; i += 8) {
    const pages = await getPagesDetails(titles.slice(i, i + 8));
    pages.forEach((p) => {
      cache.set(p.title, p);
      const tile = [...grid.querySelectorAll(".tile")].find((t) => t.dataset.title === p.title);
      if (!tile) return;
      if (p.image) tile.querySelector(".tile__media").innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
      tile.querySelector(".tile__text").textContent = p.summary;
    });
  }
}

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => search(input.value), 350);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    clearTimeout(timer);
    search(input.value);
  }
});

document.getElementById("quick-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  input.value = chip.dataset.q;
  search(chip.dataset.q);
});

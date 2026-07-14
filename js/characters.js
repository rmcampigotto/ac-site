import { initNav, initReveal, createDrawer, escapeHtml, renderSkeletons, openArticleDrawer } from "./ui.js";
import { CATEGORIES, listCategory, getPageImages, getPagesDetails, searchWiki, openSearch } from "./api.js";
import { FEATURED_CHARACTERS } from "./data.js";

initNav();
initReveal();

const drawer = createDrawer();
const grid = document.getElementById("char-grid");
const statusEl = document.getElementById("char-status");
const loadMoreBtn = document.getElementById("load-more");
const searchInput = document.getElementById("char-search");

const FILTERS = {
  featured: { type: "featured", label: "Destaques" },
  assassins: { type: "category", category: CATEGORIES.assassins, label: "Assassinos" },
  templars: { type: "category", category: CATEGORIES.templars, label: "Templários" },
  isu: { type: "category", category: CATEGORIES.isu, label: "Isu" },
  mentors: { type: "category", category: CATEGORIES.mentors, label: "Mentores" },
  masters: { type: "category", category: CATEGORIES.masters, label: "Mestres" },
  all: { type: "category", category: CATEGORIES.individuals, label: "Todos" },
  levantines: { type: "category", category: CATEGORIES.levantines, label: "Cruzadas" },
  italians: { type: "category", category: CATEGORIES.italians, label: "Renascimento" },
  ottomans: { type: "category", category: CATEGORIES.ottomans, label: "Otomanos" },
  colonials: { type: "category", category: CATEGORIES.colonials, label: "América colonial" },
  caribbean: { type: "category", category: CATEGORIES.caribbean, label: "Caribe" },
  pirates: { type: "category", category: CATEGORIES.pirates, label: "Piratas" },
  french: { type: "category", category: CATEGORIES.french, label: "França" },
  british: { type: "category", category: CATEGORIES.british, label: "Britânicos" },
  egyptians: { type: "category", category: CATEGORIES.egyptians, label: "Egito" },
  greeks: { type: "category", category: CATEGORIES.greeks, label: "Grécia" },
  norse: { type: "category", category: CATEGORIES.norse, label: "Vikings" },
  japanese: { type: "category", category: CATEGORIES.japanese, label: "Japão" },
};

const PAGE_SIZE = 18;

let activeFilter = "featured";
let nextPageToken = null;
let busy = false;
let searchTimer = null;
const detailCache = new Map();
const seenTitles = new Set();

function setStatus(msg, isError = false) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("status--error", isError);
}

function setActiveChip(filterKey) {
  document.querySelectorAll("#faction-chips .chip, #era-chips .chip").forEach((chip) => {
    chip.classList.toggle("is-active", Boolean(filterKey) && chip.dataset.filter === filterKey);
  });
}

function syncLoadMore() {
  const canMore =
    Boolean(nextPageToken) && FILTERS[activeFilter]?.type === "category" && !busy;
  loadMoreBtn.hidden = !nextPageToken || FILTERS[activeFilter]?.type !== "category";
  loadMoreBtn.disabled = busy || !nextPageToken;
  loadMoreBtn.textContent = busy ? "Carregando…" : "Carregar mais";
  loadMoreBtn.dataset.next = nextPageToken || "";
  void canMore;
}

function tileHtml(item, meta = "") {
  return `
    <button type="button" class="tile" data-title="${escapeHtml(item.title)}" data-bound="0">
      <div class="tile__media"></div>
      <div class="tile__body">
        ${meta ? `<p class="tile__meta">${escapeHtml(meta)}</p>` : ""}
        <h3 class="tile__title">${escapeHtml(item.title)}</h3>
        <p class="tile__text">${escapeHtml(item.summary || "Toque para ler a biografia.")}</p>
      </div>
    </button>`;
}

function bindNewTiles() {
  grid.querySelectorAll('.tile[data-bound="0"]').forEach((btn) => {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      openArticleDrawer(drawer, btn.dataset.title, detailCache.get(btn.dataset.title) || {});
    });
  });
}

async function fillImages(titles) {
  try {
    for (let i = 0; i < titles.length; i += 20) {
      const pages = await getPageImages(titles.slice(i, i + 20));
      pages.forEach((p) => {
        detailCache.set(p.title, { ...(detailCache.get(p.title) || {}), ...p });
        (p.aliases || []).forEach((alias) => detailCache.set(alias, detailCache.get(p.title)));

        grid.querySelectorAll(".tile").forEach((tile) => {
          if (tile.dataset.title !== p.title && !(p.aliases || []).includes(tile.dataset.title)) return;
          tile.dataset.title = p.title;
          const media = tile.querySelector(".tile__media");
          const heading = tile.querySelector(".tile__title");
          if (media && p.image) media.innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
          if (heading) heading.textContent = p.title;
        });
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function resetListState() {
  nextPageToken = null;
  seenTitles.clear();
  syncLoadMore();
}

async function showFeatured() {
  resetListState();
  renderSkeletons(grid, 6);

  const items = FEATURED_CHARACTERS.map((c) => ({
    title: c.title,
    summary: c.blurb,
    meta: c.role,
  }));

  grid.innerHTML = items.map((it) => tileHtml(it, it.meta)).join("");
  items.forEach((it) => seenTitles.add(it.title));
  bindNewTiles();
  setStatus(`${items.length} destaques`);

  try {
    const pages = await getPagesDetails(items.map((i) => i.title));
    pages.forEach((p) => {
      detailCache.set(p.title, p);
      const tile = [...grid.querySelectorAll(".tile")].find((t) => t.dataset.title === p.title);
      if (!tile) return;
      if (p.image) tile.querySelector(".tile__media").innerHTML = `<img src="${p.image}" alt="" loading="lazy">`;
      const curated = FEATURED_CHARACTERS.find((c) => c.title === p.title);
      const text = tile.querySelector(".tile__text");
      if (text) text.textContent = p.summary || curated?.blurb || text.textContent;
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadCategory(filterKey, append = false) {
  const filter = FILTERS[filterKey];
  if (!filter || filter.type === "featured") {
    return showFeatured();
  }

  if (append && busy) return;

  // Capture token NOW — before any other state change
  const tokenForRequest = append ? nextPageToken || loadMoreBtn.dataset.next || null : null;
  if (append && !tokenForRequest) {
    syncLoadMore();
    setStatus("Fim da lista neste filtro.");
    return;
  }

  busy = true;
  syncLoadMore();

  if (!append) {
    resetListState();
    renderSkeletons(grid, 6);
    setStatus(`Carregando ${filter.label}…`);
  } else {
    setStatus(`Carregando mais…`);
  }

  try {
    const result = await listCategory(filter.category, {
      limit: PAGE_SIZE,
      continueToken: tokenForRequest,
    });

    const items = result.items || [];
    const next = result.next || result.continue || null;

    const fresh = items.filter((it) => !seenTitles.has(it.title));
    fresh.forEach((it) => seenTitles.add(it.title));
    nextPageToken = next;
    loadMoreBtn.dataset.next = next || "";

    if (!append && !fresh.length) {
      grid.innerHTML = `<p class="status">Nenhum personagem neste filtro.</p>`;
      setStatus("");
      return;
    }

    if (fresh.length) {
      const html = fresh.map((it) => tileHtml(it, filter.label)).join("");
      if (append) grid.insertAdjacentHTML("beforeend", html);
      else grid.innerHTML = html;
      bindNewTiles();
      fillImages(fresh.map((i) => i.title));
    }

    setStatus(`${seenTitles.size} personagens · ${filter.label}`);
  } catch (err) {
    console.error(err);
    if (!append) grid.innerHTML = "";
    setStatus("Erro ao consultar a Wiki. Tente de novo.", true);
  } finally {
    busy = false;
    syncLoadMore();
  }
}

async function runSearch(query) {
  busy = true;
  resetListState();
  renderSkeletons(grid, 6);
  setActiveChip(null);
  setStatus("Buscando…");

  try {
    let results = await searchWiki(query, 24);
    if (!results.length) {
      const suggestions = await openSearch(query, 16);
      results = suggestions.map((s) => ({ title: s.title }));
    }

    if (!results.length) {
      grid.innerHTML = `<p class="status">Nada encontrado para “${escapeHtml(query)}”.</p>`;
      setStatus("");
      return;
    }

    results.forEach((r) => seenTitles.add(r.title));
    grid.innerHTML = results.map((r) => tileHtml(r, "Busca")).join("");
    bindNewTiles();
    setStatus(`${results.length} resultados para “${query}”`);
    fillImages(results.map((r) => r.title));
  } catch (err) {
    console.error(err);
    setStatus("Busca indisponível no momento.", true);
    grid.innerHTML = "";
  } finally {
    busy = false;
    syncLoadMore();
  }
}

function applyFilter(filterKey) {
  if (!FILTERS[filterKey]) return;
  activeFilter = filterKey;
  searchInput.value = "";
  setActiveChip(filterKey);
  loadCategory(filterKey, false);
}

document.getElementById("faction-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip?.dataset.filter) return;
  applyFilter(chip.dataset.filter);
});

document.getElementById("era-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip?.dataset.filter) return;
  applyFilter(chip.dataset.filter);
});

loadMoreBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (busy) return;
  if (FILTERS[activeFilter]?.type !== "category") return;
  loadCategory(activeFilter, true);
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  searchTimer = setTimeout(() => {
    if (q.length >= 2) runSearch(q);
    else if (!q) applyFilter(activeFilter || "featured");
  }, 320);
});

applyFilter("featured");

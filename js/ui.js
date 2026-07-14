/** Utilitários de UI compartilhados */

import { initCursor, initProgress } from "./motion.js";

export function initNav() {
  initProgress();
  initCursor();

  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  if (!nav) return;

  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle) {
    toggle.addEventListener("click", () => nav.classList.toggle("is-open"));
  }

  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav__links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("is-active");
    }
  });
}

export function initReveal() {
  const els = document.querySelectorAll(".reveal:not(.is-visible)");
  if (!els.length) return;

  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.05, rootMargin: "40px 0px 40px 0px" }
  );
  els.forEach((el) => io.observe(el));

  // Immediate reveal for anything already in / near viewport (incl. after dynamic fill)
  requestAnimationFrame(() => {
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add("is-visible");
        io.unobserve(el);
      }
    });
  });
}

export function createDrawer() {
  let backdrop = document.querySelector(".drawer-backdrop");
  let drawer = document.querySelector(".drawer");

  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    document.body.appendChild(backdrop);
  }
  if (!drawer) {
    drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.innerHTML = `
      <div class="drawer__head">
        <div></div>
        <button type="button" class="drawer__close" aria-label="Fechar">✕</button>
      </div>
      <div class="drawer__media" hidden></div>
      <div class="drawer__body"></div>
    `;
    document.body.appendChild(drawer);
  }

  const media = drawer.querySelector(".drawer__media");
  const body = drawer.querySelector(".drawer__body");
  const closeBtn = drawer.querySelector(".drawer__close");

  const close = () => {
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.style.overflow = "";
  };

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return {
    open({ title, image, summary, quote, url, bodyHtml, loading }) {
      media.hidden = !image;
      media.innerHTML = image ? `<img src="${image}" alt="">` : "";
      let content = bodyHtml;
      if (!content && loading) {
        content = `<p class="prose__muted">Carregando artigo completo…</p>`;
      } else if (!content && summary) {
        content = `<p class="prose__p">${escapeHtml(summary)}</p>`;
      } else if (!content) {
        content = `<p class="prose__muted">Sem conteúdo.</p>`;
      }
      body.innerHTML = `
        <h2>${escapeHtml(title)}</h2>
        ${quote ? `<p class="prose__quote">“${escapeHtml(quote)}”</p>` : ""}
        <div class="prose${loading ? " is-loading" : ""}" data-prose>${content}</div>
        ${url ? `<a class="drawer__link" href="${url}" target="_blank" rel="noopener">Abrir na Assassin's Creed Wiki →</a>` : ""}
      `;
      drawer.classList.add("is-open");
      backdrop.classList.add("is-open");
      document.body.style.overflow = "hidden";
    },
    update({ image, summary, quote, url, bodyHtml, title }) {
      if (title) {
        const h2 = body.querySelector("h2");
        if (h2) h2.textContent = title;
      }
      if (image) {
        media.hidden = false;
        media.innerHTML = `<img src="${image}" alt="">`;
      }
      const prose = body.querySelector("[data-prose]");
      if (prose && bodyHtml) {
        prose.classList.remove("is-loading");
        prose.innerHTML = bodyHtml;
      } else if (prose && summary) {
        prose.classList.remove("is-loading");
        prose.innerHTML = `<p class="prose__p">${escapeHtml(summary)}</p>`;
      }
      if (quote && !body.querySelector(".prose__quote")) {
        const h2 = body.querySelector("h2");
        h2?.insertAdjacentHTML(
          "afterend",
          `<p class="prose__quote">“${escapeHtml(quote)}”</p>`
        );
      }
      if (url) {
        let link = body.querySelector(".drawer__link");
        if (!link) {
          link = document.createElement("a");
          link.className = "drawer__link";
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = "Abrir na Assassin's Creed Wiki →";
          body.appendChild(link);
        }
        link.href = url;
      }
    },
    close,
  };
}

/** Open drawer and load full cleaned article from Fandom parse API */
export async function openArticleDrawer(drawer, title, seed = {}) {
  drawer.open({
    title,
    image: seed.image || null,
    summary: seed.summary || null,
    quote: seed.quote || null,
    url: seed.url || null,
    loading: true,
  });

  try {
    const { getReadableArticle } = await import("./api.js");
    const article = await getReadableArticle(title);
    const bodyHtml =
      article.bodyHtml && !/Conteúdo indisponível/i.test(article.bodyHtml)
        ? article.bodyHtml
        : article.summary
          ? `<p class="prose__p">${escapeHtml(article.summary)}</p>`
          : seed.summary
            ? `<p class="prose__p">${escapeHtml(seed.summary)}</p>`
            : article.bodyHtml;
    drawer.update({
      title: article.title,
      image: article.image || seed.image,
      quote: article.quote || seed.quote,
      url: article.url,
      bodyHtml,
      summary: article.summary || seed.summary,
    });
    return article;
  } catch (err) {
    console.error(err);
    drawer.update({
      summary:
        seed.summary ||
        "Não foi possível carregar o artigo completo. Use o link da Wiki abaixo.",
      url: seed.url || `https://assassinscreed.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    });
    return null;
  }
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSkeletons(container, n = 6) {
  container.innerHTML = Array.from({ length: n }, () => `<div class="skeleton"></div>`).join("");
}

export function navMarkup() {
  return `
  <header class="nav" id="nav">
    <div class="nav__inner">
      <a class="nav__brand" href="index.html">Ani<span>mus</span></a>
      <button class="nav__toggle" type="button" aria-label="Menu"><span></span></button>
      <ul class="nav__links">
        <li><a href="index.html">Início</a></li>
        <li><a href="jogos.html">Jogos</a></li>
        <li><a href="personagens.html">Personagens</a></li>
        <li><a href="timeline.html">Timeline</a></li>
        <li><a href="lore.html">Lore</a></li>
        <li><a href="hqs.html">HQs</a></li>
        <li><a href="enciclopedia.html">Enciclopédia</a></li>
      </ul>
    </div>
  </header>`;
}

export function footerMarkup() {
  return `
  <footer class="footer">
    <div class="container footer__inner">
      <p><strong>Animus</strong> é apenas um guia não oficial feito por fãs. Não é um produto da Ubisoft e não possui vínculo oficial com a empresa.</p>
      <p>Assassin's Creed, personagens, imagens e demais conteúdos da franquia são propriedade da <strong>Ubisoft</strong>. Dados de referência via <a href="https://assassinscreed.fandom.com" target="_blank" rel="noopener">Assassin's Creed Wiki (Fandom)</a>.</p>
    </div>
  </footer>`;
}

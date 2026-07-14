import { initNav, initReveal, escapeHtml } from "./ui.js";
import { LORE_CHRONICLE } from "./data.js";

initNav();

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.getElementById("chronicle-root");
const toc = document.getElementById("chronicle-toc");
const ash = document.getElementById("tale-ash");
const glyphs = document.getElementById("tale-glyphs");
const readbar = document.getElementById("tale-readbar");

const CHAPTER_ANIMS = [
  "rise",
  "drift-left",
  "drift-right",
  "ember-in",
  "soft-scale",
  "fade-up",
  "glow-in",
  "shatter-in",
];

if (root) {
  root.innerHTML = LORE_CHRONICLE.map((chapter, i) => {
    const anim = CHAPTER_ANIMS[i % CHAPTER_ANIMS.length];
    return `
    <section
      class="chronicle__chapter"
      id="${escapeHtml(chapter.id)}"
      data-chapter="${escapeHtml(chapter.id)}"
      data-anim="${anim}"
    >
      <div class="chronicle__motif anim-item" style="--i:0" aria-hidden="true">${escapeHtml(chapter.motif || "△")}</div>
      <div class="chronicle__rule anim-item" style="--i:0" aria-hidden="true"></div>
      <header class="chronicle__head">
        <p class="chronicle__mark anim-item" style="--i:1">${escapeHtml(chapter.mark)}</p>
        <p class="chronicle__era anim-item" style="--i:2">${escapeHtml(chapter.era)}</p>
        <h2 class="chronicle__title anim-item" style="--i:3">${escapeHtml(chapter.title)}</h2>
        ${
          chapter.whisper
            ? `<p class="chronicle__whisper anim-item" style="--i:4">${escapeHtml(chapter.whisper)}</p>`
            : ""
        }
      </header>
      <div class="chronicle__body">
        ${chapter.paragraphs
          .map((p, pi) => {
            const closing = pi === chapter.paragraphs.length - 1 && chapter.id === "agora";
            return `<p class="anim-item${closing ? " is-closing" : ""}" style="--i:${5 + pi}">${escapeHtml(p)}</p>`;
          })
          .join("")}
      </div>
    </section>`;
  }).join("");
}

if (toc) {
  toc.innerHTML = `
    <p class="chronicle-toc__label">Capítulos</p>
    ${LORE_CHRONICLE.map(
      (c) => `<a href="#${escapeHtml(c.id)}" data-toc="${escapeHtml(c.id)}"><span>${escapeHtml(c.mark)}</span>${escapeHtml(c.title)}</a>`
    ).join("")}
  `;

  toc.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href")?.slice(1);
      const el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    });
  });
}

function spawnAsh() {
  if (!ash || reduced) return;
  const count = window.matchMedia("(max-width: 720px)").matches ? 16 : 34;
  ash.innerHTML = Array.from({ length: count }, () => {
    const left = Math.random() * 100;
    const delay = Math.random() * 14;
    const dur = 11 + Math.random() * 16;
    const size = 1 + Math.random() * 2.8;
    const drift = (Math.random() * 50 - 25).toFixed(1);
    return `<span style="--l:${left}%;--d:${delay}s;--t:${dur}s;--s:${size}px;--x:${drift}px"></span>`;
  }).join("");
}

function spawnGlyphs() {
  if (!glyphs || reduced) return;
  const symbols = ["△", "▽", "◇", "○", "✕", "·", "—"];
  const count = window.matchMedia("(max-width: 720px)").matches ? 6 : 12;
  glyphs.innerHTML = Array.from({ length: count }, () => {
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const left = 5 + Math.random() * 90;
    const top = 8 + Math.random() * 84;
    const delay = Math.random() * 10;
    const dur = 8 + Math.random() * 12;
    const size = 0.65 + Math.random() * 0.9;
    return `<b style="--gl:${left}%;--gt:${top}%;--gd:${delay}s;--gdur:${dur}s;--gs:${size}">${sym}</b>`;
  }).join("");
}

function initChapterAnimations() {
  const links = [...(toc?.querySelectorAll("[data-toc]") || [])];
  const sections = LORE_CHRONICLE.map((c) => document.getElementById(c.id)).filter(Boolean);
  if (!sections.length) return;

  if (reduced) {
    sections.forEach((s) => s.classList.add("is-in", "is-reading"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in", "is-reading");
          const id = entry.target.id;
          links.forEach((a) => a.classList.toggle("is-active", a.dataset.toc === id));
          document.body.dataset.reading = id;
        } else if (entry.boundingClientRect.top > 0) {
          entry.target.classList.remove("is-in");
        }
      });
    },
    { rootMargin: "-16% 0px -30% 0px", threshold: 0.1 }
  );

  sections.forEach((s) => io.observe(s));
}

function initAmbientParallax() {
  if (reduced) return;
  const fogA = document.querySelector(".tale-ambient__fog--a");
  const fogB = document.querySelector(".tale-ambient__fog--b");
  const fogC = document.querySelector(".tale-ambient__fog--c");
  const ember = document.querySelector(".tale-ambient__ember");
  if (!fogA) return;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = y / max;
      fogA.style.transform = `translate3d(0, ${y * 0.05}px, 0)`;
      if (fogB) fogB.style.transform = `translate3d(${Math.sin(p * 6) * 12}px, ${y * -0.035}px, 0)`;
      if (fogC) fogC.style.transform = `translate3d(${Math.cos(p * 4) * 18}px, ${y * 0.02}px, 0)`;
      if (ember) {
        const warmth = 0.5 + Math.sin(p * Math.PI) * 0.4;
        ember.style.opacity = warmth.toFixed(3);
        ember.style.transform = `translate3d(-50%, ${y * 0.025}px, 0) scale(${(1 + p * 0.15).toFixed(3)})`;
      }
      if (readbar) readbar.style.transform = `scaleX(${p})`;
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

spawnAsh();
spawnGlyphs();
initChapterAnimations();
initAmbientParallax();
initReveal();

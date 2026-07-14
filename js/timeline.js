import { initNav, initReveal, escapeHtml } from "./ui.js";
import { ERA_CHAPTERS } from "./data.js";

initNav();

const nav = document.getElementById("tl-nav");
const track = document.getElementById("tl-track");

nav.innerHTML = ERA_CHAPTERS.map(
  (era) => `<a href="#${era.id}">${escapeHtml(era.era)}</a>`
).join("");

track.innerHTML = ERA_CHAPTERS.map(
  (era) => `
  <article class="tl-era reveal" id="${era.id}" style="--era-accent:${era.accent}">
    <p class="tl-era__years">${escapeHtml(era.years)}</p>
    <p class="tl-era__era">${escapeHtml(era.era)}</p>
    <h2>${escapeHtml(era.title)}</h2>
    <p class="tl-era__summary">${escapeHtml(era.summary)}</p>
    <div class="tl-era__games">
      ${era.games.map((g) => `<span>${escapeHtml(g)}</span>`).join("")}
    </div>
    <div class="tl-era__box">
      <h3>O que essa era explica</h3>
      <ul>
        ${era.explains.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  </article>`
).join("");

initReveal();

const links = [...nav.querySelectorAll("a")];
const sections = ERA_CHAPTERS.map((e) => document.getElementById(e.id));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-inview", entry.isIntersecting);
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));
    });
  },
  { rootMargin: "-35% 0px -45% 0px", threshold: 0 }
);

sections.forEach((s) => s && io.observe(s));

links.forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href")?.slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  });
});

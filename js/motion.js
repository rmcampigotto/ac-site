/** Motion do guia: cursor, tilt, rail, progress, intro */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

let progressReady = false;
let cursorReady = false;

export function initIntro() {
  const intro = document.querySelector(".intro");
  if (!intro) return;
  const done = () => intro.classList.add("is-done");
  if (reduced) {
    done();
    return;
  }
  window.setTimeout(done, 2100);
}

export function initProgress() {
  if (progressReady) return;
  const bar = document.querySelector(".progress");
  if (!bar) return;
  progressReady = true;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? (window.scrollY / max) * 100 : 0;
    bar.style.width = `${p}%`;
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

export function initCursor() {
  if (cursorReady || reduced || !finePointer) return;
  cursorReady = true;
  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "cursor";
  ring.className = "cursor__ring";
  document.body.append(dot, ring);
  document.body.classList.add("has-cursor");

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let rx = x;
  let ry = y;

  window.addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    },
    { passive: true }
  );

  const tick = () => {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(tick);
  };
  tick();

  const hoverables = "a, button, .tile, .artifact, .rail__card, .chapter, .chip, .lore-block, .lore-cat, input, .tl-nav a";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hoverables)) {
      dot.classList.add("is-hover");
      ring.classList.add("is-hover");
    }
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(hoverables)) {
      dot.classList.remove("is-hover");
      ring.classList.remove("is-hover");
    }
  });
}

export function initCrestParallax() {
  const panel = document.querySelector(".hero__panel");
  const hero = document.querySelector(".hero--cinema");
  if (!hero || !panel || reduced || !finePointer) return;

  hero.addEventListener(
    "pointermove",
    (e) => {
      const rect = hero.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      panel.style.setProperty("--mx", `${50 + px * 40}%`);
      panel.style.setProperty("--my", `${40 + py * 40}%`);
      panel.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 5}deg)`;
    },
    { passive: true }
  );

  hero.addEventListener("pointerleave", () => {
    panel.style.transform = "perspective(900px) rotateY(0) rotateX(0)";
  });
}

export function initTiltCards(selector = ".artifact") {
  if (reduced || !finePointer) return;
  document.querySelectorAll(selector).forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add("is-tilting");
      card.style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 10}deg) translateY(-6px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.classList.remove("is-tilting");
      card.style.transform = "";
    });
  });
}

export function initRailDrag(selector = ".rail") {
  const rail = document.querySelector(selector);
  if (!rail) return;

  let down = false;
  let moved = false;
  let startX = 0;
  let scrollLeft = 0;
  let pointerId = null;

  const end = (e) => {
    if (!down) return;
    if (pointerId != null && e?.pointerId != null && e.pointerId !== pointerId) return;
    down = false;
    pointerId = null;
    rail.classList.remove("is-dragging");
    if (moved) {
      rail.dataset.dragged = "1";
      window.setTimeout(() => {
        rail.dataset.dragged = "0";
      }, 180);
    }
  };

  rail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = true;
    moved = false;
    pointerId = e.pointerId;
    rail.dataset.dragged = "0";
    startX = e.clientX;
    scrollLeft = rail.scrollLeft;
    try {
      rail.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  rail.addEventListener("pointermove", (e) => {
    if (!down || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) {
      moved = true;
      rail.classList.add("is-dragging");
    }
    if (moved) rail.scrollLeft = scrollLeft - dx;
  });

  rail.addEventListener("pointerup", end);
  rail.addEventListener("pointercancel", end);
  rail.addEventListener("lostpointercapture", end);

  bindRailWheel(rail);
}

/**
 * Horizontal wheel only: Shift+roda, tilt do mouse ou gesto horizontal no trackpad.
 * Scroll vertical da página não é interceptado — evita hijack ao passar o mouse no rail.
 */
function bindRailWheel(rail) {
  rail.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || event.metaKey) return;

      const wantsHorizontal =
        event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!wantsHorizontal) return;

      const delta = horizontalWheelDelta(event, rail.clientWidth);
      if (!delta) return;

      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const next = Math.min(maxScroll, Math.max(0, rail.scrollLeft + delta));
      if (next === rail.scrollLeft) return;

      event.preventDefault();
      rail.scrollLeft = next;
    },
    { passive: false }
  );
}

function horizontalWheelDelta(event, pageSize) {
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageSize : 1;
  const pixels =
    event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
  return pixels * scale;
}

export function initRailControls(railSelector = "#games-rail", prevId = "rail-prev", nextId = "rail-next") {
  const rail = document.querySelector(railSelector);
  if (!rail) return;
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  const step = () => Math.min(Math.round(rail.clientWidth * 0.8), 340);
  prev?.addEventListener("click", () => {
    rail.scrollBy({ left: -step(), behavior: "smooth" });
  });
  next?.addEventListener("click", () => {
    rail.scrollBy({ left: step(), behavior: "smooth" });
  });
}

export function initMagnetic(selector = ".magnetic") {
  if (reduced || !finePointer) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

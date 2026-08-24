import * as THREE from "three";

/* ═══════════════════════════════════════════════════════
   ESTHINGTON GROUP :: cinematic scroll engine
   Structure follows docs/mostar_guide.md (sticky stage,
   smoothed scroll, smoothstep segments, CSS-var writes);
   the parallax photo stack is replaced by a live Three.js
   "blueprint city" per docs/kage.md.
   ═══════════════════════════════════════════════════════ */

const root = document.documentElement;
const section = document.querySelector(".cinema-scroll");
const canvas = document.getElementById("gl");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const SCROLL_LEN = 3600;

/* ───────────────── helpers ───────────────── */
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, v) => { const x = clamp((v - e0) / (e1 - e0)); return x * x * (3 - 2 * x); };
const segmentInOut = (s, a, b, c, d) => {
  const enter = smoothstep(a, b, s), exit = smoothstep(c, d, s);
  return { enter, exit, active: enter * (1 - exit) };
};

// deterministic PRNG so the skyline is identical on every load
let _seed = 20260824;
const rand = () => { _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };

/* ═══════════════ PROJECTS ═══════════════ */
const PROJECTS = [
  { sector: "Apo, Abuja",     status: "Completed", name: "Primelux Estate",      copy: "A premium residential complex featuring 20 luxury apartments with state-of-the-art amenities. Delivered on time with 140% ROI for early investors." },
  { sector: "Kuje, Abuja",    status: "Ongoing",   name: "Sunview City",         copy: "Our flagship commercial development. A 35-storey masterpiece redefining the skyline. Currently in the foundation phase, offering pre-sale equity opportunities." },
  { sector: "Kurudu, Abuja",  status: "Ongoing",   name: "Peaceland Estate",     copy: "Sustainable living meets modern luxury. A solar-powered gated community designed for the eco-conscious family." },
  { sector: "Dei Dei, Abuja", status: "Ongoing",   name: "Treasure Gate Estate", copy: "A bustling retail hub hosting over 100 international and local brands. A cornerstone of commercial success in the district." },
  { sector: "Apo Wassa",      status: "Hot selling", name: "Access Gate Estate", copy: "A thriving community designed for modern living with state-of-the-art facilities." },
  { sector: "Apo Waru",       status: "Hot selling", name: "Primelux Exclusive", copy: "Experience luxury and tranquility in our premium exclusive residential plots." },
  { sector: "Maitama 2",      status: "Hot selling", name: "Estora Residence",   copy: "Premium housing units set in the heart of Maitama 2, combining elegance and accessibility." },
  { sector: "Pyakasa",        status: "Selling",   name: "Meridian City",        copy: "Strategic commercial and residential spaces with high ROI potential." },
  { sector: "Kuje",           status: "Selling",   name: "Champions City",       copy: "A master-planned community by Champions Properties, in one of Abuja's fastest-appreciating corridors." },
  { sector: "Lugbe",          status: "Selling",   name: "Leisure View",         copy: "Residential plots at Lugbe, positioned for steady capital appreciation." },
];

/* ═══════════════ THREE.JS WORLD ═══════════════ */
// sampled from docs/assets/icon.png :: the logo's violet→electric-blue gradient + its orange bar
const INK = 0x070515, INDIGO = 0x2a1b6e, ACCENT = 0xf58634;
const VIOLET = 0x5b2fb0, ELECTRIC = 0x2b17f4;

let renderer, scene, camera, cityGroup, glReady = false;

function buildWorld() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(INK, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK, 0.0135);

  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);

  cityGroup = new THREE.Group();
  scene.add(cityGroup);

  cityGroup.add(buildGround());
  const { solids, edges } = buildTowers();
  cityGroup.add(solids, edges);
  scene.add(buildHorizonGlow(), buildDust());
  glReady = true;
}

/* --- ground: a surveyor's grid, warm at the origin --- */
function buildGround() {
  const X = 90, Z = 200, STEP = 5;
  const pos = [], col = [];
  const c = new THREE.Color();
  const tint = (x, z) => {
    const d = Math.hypot(x, z + 40);
    const heat = clamp(1 - d / 105);
    c.setHex(ELECTRIC).lerp(new THREE.Color(VIOLET), clamp(1 - d / 150))
     .lerp(new THREE.Color(ACCENT), heat * heat * 0.8);
    const fade = clamp(1 - d / 150, 0.06, 1);
    return [c.r * fade, c.g * fade, c.b * fade];
  };
  for (let x = -X; x <= X; x += STEP) {
    pos.push(x, 0, -Z, x, 0, 40);
    col.push(...tint(x, -Z), ...tint(x, 40));
  }
  for (let z = -Z; z <= 40; z += STEP) {
    pos.push(-X, 0, z, X, 0, z);
    col.push(...tint(-X, z), ...tint(X, z));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.62,
  }));
}

/* --- towers: dark solids that occlude, orange edges that draw --- */
function buildTowers() {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const boxPos = box.attributes.position.array;
  const edgePos = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)).attributes.position.array;

  const sPos = [], sCol = [], ePos = [], eCol = [];
  const dark = new THREE.Color(0x0b0722);
  const lift = new THREE.Color(ELECTRIC).multiplyScalar(0.22);
  const warm = new THREE.Color(ACCENT);
  const cool = new THREE.Color(VIOLET);
  const tmp = new THREE.Color();

  const push = (src, outPos, outCol, w, h, d, px, pz, colorFn) => {
    for (let i = 0; i < src.length; i += 3) {
      const y = src[i + 1] * h + h / 2;
      outPos.push(src[i] * w + px, y, src[i + 2] * d + pz);
      const rgb = colorFn(y / h, Math.hypot(px, pz + 40));
      outCol.push(rgb.r, rgb.g, rgb.b);
    }
  };

  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -20; gz <= 3; gz++) {
      const px = gx * 9 + (rand() - 0.5) * 3.4;
      const pz = gz * 9 + (rand() - 0.5) * 3.4;
      const dist = Math.hypot(px, pz + 40);
      if (rand() > clamp(1.12 - dist / 130)) continue;      // thin out toward the edges
      if (Math.abs(px) < 4.5 && pz > -70) continue;          // keep the camera lane clear

      const core = clamp(1 - dist / 95);
      const h = 3 + Math.pow(core, 1.7) * 34 * (0.35 + rand() * 0.9);
      const w = 3.2 + rand() * 3.4;
      const d = 3.2 + rand() * 3.4;

      push(boxPos, sPos, sCol, w, h, d, px, pz, (t) => tmp.copy(dark).lerp(lift, t * 0.85));
      push(edgePos, ePos, eCol, w, h, d, px, pz, (t, dd) => {
        const heat = clamp(1 - dd / 95);
        const fade = clamp(1 - dd / 175, 0.05, 1);
        tmp.copy(cool).lerp(warm, Math.pow(heat, 1.4) * (0.3 + t * 0.7));
        return tmp.multiplyScalar(fade);
      });
    }
  }

  const mk = (p, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    return g;
  };
  return {
    solids: new THREE.Mesh(mk(sPos, sCol), new THREE.MeshBasicMaterial({ vertexColors: true })),
    edges: new THREE.LineSegments(mk(ePos, eCol), new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
    })),
  };
}

/* --- horizon glow, drawn to a canvas so nothing is fetched --- */
function buildHorizonGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(245,134,52,0.85)");
  grd.addColorStop(0.35, "rgba(217,106,26,0.30)");
  grd.addColorStop(1, "rgba(244,121,32,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55,
  }));
  sprite.position.set(0, 6, -170);
  sprite.scale.set(260, 130, 1);
  return sprite;
}

/* --- dust motes --- */
function buildDust() {
  const N = 900, pos = [];
  for (let i = 0; i < N; i++) pos.push((rand() - 0.5) * 220, rand() * 70, (rand() - 0.5) * 300 - 60);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xf58634, size: 0.36, transparent: true, opacity: 0.35,
    sizeAttenuation: true, depthWrite: false,
  }));
}

/* --- camera flight path, keyed to scroll progress --- */
const KEYS = [
  { p: 0.00, pos: [0,  2.4,  36], look: [0,  7, -20] },
  { p: 0.30, pos: [0,  6.0,   6], look: [0, 12, -46] },
  { p: 0.58, pos: [0, 15.0, -22], look: [0, 10, -78] },
  { p: 0.82, pos: [0, 34.0, -46], look: [0,  4, -96] },
  { p: 1.00, pos: [0, 52.0, -30], look: [0,  0, -84] },
];

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function flyCamera(p, mx, my) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const t = smoothstep(k0.p, k1.p, p);

  _a.fromArray(k0.pos).lerp(_b.fromArray(k1.pos), t);
  camera.position.set(_a.x + mx * 7, _a.y + my * -3.2, _a.z);

  _a.fromArray(k0.look).lerp(_b.fromArray(k1.look), t);
  camera.lookAt(_a.x + mx * 4, _a.y + my * -2, _a.z);
}

/* ═══════════════ SCROLL ENGINE ═══════════════ */
let targetMouseX = 0, targetMouseY = 0, mouseX = 0, mouseY = 0;
let targetScroll = 0, smoothScroll = 0, initialized = false, rafPending = false;

const getScrollDistance = () =>
  clamp(-section.getBoundingClientRect().top, 0, section.offsetHeight - innerHeight);

function update() {
  rafPending = false;
  targetScroll = getScrollDistance();

  if (!initialized || reduceMotion.matches) { smoothScroll = targetScroll; initialized = true; }
  else smoothScroll = lerp(smoothScroll, targetScroll, 0.14);
  if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

  mouseX = lerp(mouseX, targetMouseX, 0.12);
  mouseY = lerp(mouseY, targetMouseY, 0.12);
  const mx = reduceMotion.matches ? 0 : mouseX;
  const my = reduceMotion.matches ? 0 : mouseY;

  const s = smoothScroll;
  const progress = clamp(s / SCROLL_LEN);
  const introExit = smoothstep(90, 650, s);
  const frameA = segmentInOut(s, 560, 900, 1300, 1620);
  const frameB = segmentInOut(s, 1760, 2140, 2540, 2700);
  const sightsEnter = Math.pow(smoothstep(2760, 3500, s), 1.55);
  const controlsEnter = smoothstep(3300, 3600, s);
  const wash = clamp(frameA.active + frameB.active);

  const set = (k, v) => root.style.setProperty(k, v);

  set("--mx", mx.toFixed(4));
  set("--my", my.toFixed(4));

  set("--title-y", `${introExit * -210}px`);
  set("--title-scale", (1 - introExit * 0.08).toFixed(4));
  set("--title-opacity", (1 - introExit).toFixed(4));

  set("--intro-y", `${introExit * 90}px`);
  set("--intro-opacity", (1 - introExit).toFixed(4));

  set("--panel-a-opacity", (frameA.active * (1 - frameA.exit)).toFixed(4));
  set("--panel-a-y", `calc(-50% + ${(-frameA.exit * 86 + (1 - frameA.enter) * 58).toFixed(2)}px)`);
  set("--panel-b-opacity", (frameB.active * (1 - frameB.exit)).toFixed(4));
  set("--panel-b-y", `calc(-50% + ${(-frameB.exit * 86 + (1 - frameB.enter) * 58).toFixed(2)}px)`);

  set("--shade-opacity", "1");
  set("--shade-top", (0.14 + wash * 0.42).toFixed(4));
  set("--shade-mid", (0.06 + wash * 0.34).toFixed(4));
  set("--shade-bottom", (0.30 + wash * 0.42).toFixed(4));
  set("--vignette", (0.55 + progress * 0.2).toFixed(4));

  set("--sights-visibility", sightsEnter > 0.01 ? "visible" : "hidden");
  set("--sights-enter-x", `${((1 - sightsEnter) * 420).toFixed(3)}vw`);
  set("--sights-controls-opacity", controlsEnter.toFixed(4));
  sightsControls.classList.toggle("is-ready", controlsEnter > 0.98);

  if (glReady) {
    flyCamera(progress, mx, my);
    renderer.render(scene, camera);
  }

  if (Math.abs(smoothScroll - targetScroll) > 0.08 ||
      Math.abs(mouseX - targetMouseX) > 0.001 ||
      Math.abs(mouseY - targetMouseY) > 0.001) requestTick();
}

function requestTick() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(update);
}

/* ═══════════════ PROJECTS SLIDER ═══════════════ */
const track = document.getElementById("projectsTrack");
const sightsControls = document.querySelector(".sights-controls");
let cards = [], originalCount = 0, activeSight = 0;

function cardEl(p, idx) {
  const el = document.createElement("article");
  el.className = "sight-card";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `Open ${p.name}`);
  el.dataset.sightIndex = idx;
  el.innerHTML =
    `<span class="sight-kicker"></span>` +
    `<span class="sight-status"></span>` +
    `<h3></h3><p></p>`;
  el.querySelector(".sight-kicker").textContent = p.sector;
  el.querySelector(".sight-status").textContent = p.status;
  el.querySelector("h3").textContent = p.name;
  el.querySelector("p").textContent = p.copy;
  return el;
}

function setupSlider() {
  originalCount = PROJECTS.length;
  const frag = document.createDocumentFragment();
  for (let set = 0; set < 3; set++) {
    PROJECTS.forEach((p, i) => frag.appendChild(cardEl(p, set * originalCount + i)));
  }
  track.replaceChildren(frag);
  cards = Array.from(track.children);
  activeSight = originalCount;

  cards.forEach((card) => {
    card.addEventListener("click", () => selectCard(card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCard(card); }
    });
  });
  track.addEventListener("transitionend", normalizeSlider);
  updateSlider();
}

function updateSlider() {
  if (!cards.length) return;
  const w = cards[0].offsetWidth;
  const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0;
  root.style.setProperty("--sights-shift", `${-(w + gap) * activeSight}px`);
  cards.forEach((c, i) => c.classList.toggle("is-active", i === activeSight));
}

const moveSlider = (dir) => { activeSight += dir; updateSlider(); };
const selectCard = (card) => {
  const i = Number(card.dataset.sightIndex);
  if (Number.isFinite(i)) { activeSight = i; updateSlider(); }
};

function jumpSlider(i) {
  track.classList.add("is-jumping");
  activeSight = i;
  updateSlider();
  requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove("is-jumping")));
}

function normalizeSlider() {
  if (activeSight >= originalCount * 2) jumpSlider(activeSight - originalCount);
  else if (activeSight < originalCount) jumpSlider(activeSight + originalCount);
}

/* ═══════════════ RESIZE / LISTENERS ═══════════════ */
function onResize() {
  if (glReady) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  updateSlider();
  requestTick();
}

addEventListener("scroll", requestTick, { passive: true });
addEventListener("resize", onResize);
addEventListener("pointermove", (e) => {
  targetMouseX = e.clientX / innerWidth - 0.5;
  targetMouseY = e.clientY / innerHeight - 0.5;
  requestTick();
}, { passive: true });

document.querySelector(".sight-prev").addEventListener("click", () => moveSlider(-1));
document.querySelector(".sight-next").addEventListener("click", () => moveSlider(1));

/* ═══════════════ BOOT ═══════════════ */
document.getElementById("year").textContent = new Date().getFullYear();

try { buildWorld(); }
catch (err) { console.warn("WebGL unavailable, running without the 3D world.", err); canvas.style.display = "none"; }

setupSlider();
requestTick();

/* ═══════════════ COMPANIES :: entrance choreography ═══════════════ */
/* one-shot, then detaches so the cards return to their authored styles */
function playEntrance() {
  const html = document.documentElement;
  if (reduceMotion.matches) { html.classList.remove("motion-pending"); return; }

  const mosaic = document.querySelector(".mosaic");
  if (!mosaic) { html.classList.remove("motion-pending"); return; }

  let played = false;
  const run = () => {
    if (played) return;
    played = true;
    io.disconnect();
    Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((r) => setTimeout(r, 700)),
    ]).then(() => {
      html.classList.remove("motion-pending");
      html.classList.add("entrance-run");
      setTimeout(() => html.classList.remove("entrance-run"), 1850);
    });
  };

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && run()),
    { threshold: 0.15 }
  );
  io.observe(mosaic);

  // fail-safe: never leave the cards hidden
  setTimeout(() => { if (!played) { played = true; io.disconnect(); html.classList.remove("motion-pending"); } }, 4000);
}

/* ═══════════════ HUB :: shared spoke / line hover ═══════════════ */
function setupSpokes() {
  const spokes = document.querySelectorAll(".spoke");
  const lines = document.querySelectorAll(".hub-diagram line");
  if (!spokes.length) return;

  const hot = (i, on) => {
    spokes[i].classList.toggle("is-hot", on);
    const line = document.querySelector(`.hub-diagram line[data-spoke="${i}"]`);
    if (line) line.classList.toggle("is-hot", on);
  };
  spokes.forEach((s, i) => {
    s.addEventListener("pointerenter", () => hot(i, true));
    s.addEventListener("pointerleave", () => hot(i, false));
  });
  lines.forEach((l) => {
    const i = Number(l.dataset.spoke);
    l.addEventListener("pointerenter", () => hot(i, true));
    l.addEventListener("pointerleave", () => hot(i, false));
  });
}

/* ═══════════════ FOOTER :: fit the watermark to its glyph box ═══════════════ */
function fitWatermark() {
  const svg = document.getElementById("watermarkSvg");
  const text = document.getElementById("watermarkText");
  if (!svg || !text) return;
  try {
    const b = text.getBBox();
    if (b.width && b.height) svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
  } catch (e) { /* getBBox throws if the node is not rendered yet */ }
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWatermark);
else addEventListener("load", fitWatermark);
addEventListener("resize", fitWatermark);

playEntrance();
setupSpokes();

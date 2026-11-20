// NEON BAY — a 48 second 3D cartoon short, rendered live with three.js.
// Everything (city, cars, characters, camera, lights, titles) is a pure function of time t,
// so the film can be scrubbed, played live, or rendered frame-by-frame deterministically.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const Q = new URLSearchParams(location.search);
const RENDER = Q.has('render');
const DUR = 48;
const RW = +Q.get('w') || 1920, RH = +Q.get('h') || 1080;

// ---------------------------------------------------------------- utils
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = mulberry(20261120);
const rr = (a, b) => a + (b - a) * R();
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = a => a[Math.floor(R() * a.length)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smr = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const win = (t, a, b, fi = .2, fo = .2) => sm(a, a + fi, t) * (1 - sm(b - fo, b, t));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const noise1 = (x, s = 0) => { const i = Math.floor(x), f = x - i; const h = n => { const v = Math.sin((n + s * 57.3) * 127.1) * 43758.5453; return v - Math.floor(v); }; const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1; };

// ---------------------------------------------------------------- renderer / stage
const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: RENDER, powerPreference: 'high-performance' });
renderer.setPixelRatio(RENDER ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 6000);
scene.add(camera);

let SW = RW, SH = RH;
function layout() {
  if (RENDER) { SW = RW; SH = RH; }
  else { const w = innerWidth, h = innerHeight; if (w / h > 16 / 9) { SH = h; SW = h * 16 / 9; } else { SW = w; SH = w * 9 / 16; } }
  stage.style.width = SW + 'px'; stage.style.height = SH + 'px';
  document.documentElement.style.setProperty('--u', (SW / 100) + 'px');
  renderer.setSize(SW, SH, false);
  if (composer) { composer.setSize(SW, SH); bloom.setSize(SW, SH); }
  camera.aspect = 16 / 9; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- canvas textures
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { rep = false, srgb = true } = {}) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }

const matCache = new Map();
function std(color, o = {}) { const k = color + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: .75, ...o })); return matCache.get(k); }
function mesh(g, m, cast = true, recv = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; return x; }
function rodGeo(a, b, r, seg = 8) { const d = V().subVectors(b, a); const L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; }
function boxGeo(w, h, d, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function colorize(g, col) { const c = new THREE.Color(col); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function strip(g) { const keep = ['position', 'normal', 'uv', 'color']; for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.index) { const n = g.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); } return g; }
function merge(list) { return mergeGeometries(list.map(strip), false); }

// glowing neon text sign
function neonTex(text, color, { font = 'Bungee', w = 1024, h = 256, size = 150, script = false } = {}) {
  const [c, g] = cnv(w, h);
  g.font = `${size}px ${script ? 'Pacifico' : font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = size; while (g.measureText(text).width > w * .9 && s > 20) { s -= 6; g.font = `${s}px ${script ? 'Pacifico' : font}`; }
  g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color;
  for (let i = 0; i < 3; i++) g.fillText(text, w / 2, h / 2 + 6);
  g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.globalAlpha = .9; g.lineWidth = 3; g.strokeStyle = '#fff';
  g.fillText(text, w / 2, h / 2 + 6);
  return tex(c);
}
function boardTex(text, bg, fg, { font = 'Bungee', w = 1024, h = 256, size = 120, script = false, border = null } = {}) {
  const [c, g] = cnv(w, h); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 16; g.strokeRect(14, 14, w - 28, h - 28); }
  g.font = `${size}px ${script ? 'Pacifico' : font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let s = size; while (g.measureText(text).width > w * .86 && s > 20) { s -= 6; g.font = `${s}px ${script ? 'Pacifico' : font}`; }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillText(text, w / 2 + 5, h / 2 + 11); g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 6);
  return tex(c);
}
function radialTex(inner = 'rgba(255,255,255,1)', size = 128) { const [c, g] = cnv(size, size); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, inner); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, size, size); return tex(c); }
const glowTex = radialTex();

// ---------------------------------------------------------------- global, time-driven state
const G = { night: 0, t: 0 };
const updaters = []; // functions(t) called every frame
const onT = f => updaters.push(f);
const lightMats = { head: new THREE.MeshBasicMaterial({ color: 0xffffff }), tail: new THREE.MeshBasicMaterial({ color: 0xff1030 }), lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), red: new THREE.MeshBasicMaterial({ color: 0xff2020 }) };
const additive = (map, color, op = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true });

// ---------------------------------------------------------------- world constants
const STREETS_Z = [0, -40, -80, -120, -160, -200, -240];   // streets running along z (x = const)
const STREETS_X = []; for (let k = -7; k <= 7; k++) STREETS_X.push(20 + 40 * k); // streets running along x (z = const)
const ROAD_W = 10;
const HWY_Z = -200; // elevated expressway + bridge
const BLVD = { x0: 28, x1: 42 }; // beach boulevard
const PROM = { x0: 42, x1: 50 }; // beach promenade
const PUDDLE = V(44.2, 0.155, 0);

// ================================================================ textures: roads, windows, water
function roadTexture(kind) {
  const [c, g] = cnv(256, 256);
  g.fillStyle = '#3a3b40'; g.fillRect(0, 0, 256, 256);
  const r = mulberry(kind.length * 7);
  for (let i = 0; i < 2600; i++) { const v = 45 + r() * 30; g.fillStyle = `rgba(${v},${v},${v + 4},.5)`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.fillStyle = 'rgba(20,20,24,.25)'; for (let i = 0; i < 6; i++) g.fillRect(r() * 256, 0, 6 + r() * 10, 256); // tire wear
  const line = (x, w, col, dash) => { g.fillStyle = col; if (dash) g.fillRect(x - w / 2, 20, w, 110); else g.fillRect(x - w / 2, 0, w, 256); };
  if (kind === 'city') { // 10 m wide: parking | lane | lane | parking
    line(64, 3, '#e8e8e8', false); line(192, 3, '#e8e8e8', false);
    line(124, 4, '#f2c230', false); line(132, 4, '#f2c230', false);
    line(8, 4, '#cfcfcf', false); line(248, 4, '#cfcfcf', false);
  } else if (kind === 'blvd') { // 14 m: shoulder 1.5 | 4 lanes x 2.5 | parking 2.5
    const px = m => m / 14 * 256;
    line(px(1.5), 4, '#eee', false); line(px(4), 3, '#eee', true); line(px(6.45), 3, '#f2c230', false); line(px(6.55) + 3, 3, '#f2c230', false); line(px(9), 3, '#eee', true); line(px(11.5), 4, '#eee', false);
  } else if (kind === 'hwy') { // 14 m: 4 lanes x 3.5
    line(64, 3, '#eee', true); line(128, 5, '#f2c230', false); line(192, 3, '#eee', true); line(6, 4, '#eee', false); line(250, 4, '#eee', false);
  }
  return tex(c, { rep: true });
}
const roadMat = { city: null, blvd: null, hwy: null };
function makeRoadMats() {
  for (const k of ['city', 'blvd', 'hwy']) roadMat[k] = new THREE.MeshStandardMaterial({ map: roadTexture(k), roughness: .85, metalness: 0, envMapIntensity: .6 });
  const inter = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: .85 });
  roadMat.inter = inter;
  onT(() => { const wet = G.night; for (const m of [roadMat.city, roadMat.blvd, roadMat.hwy, inter]) { m.roughness = lerp(.85, .32, wet); m.envMapIntensity = lerp(.5, 1.4, wet); } });
}

const winStyles = {};
function makeWindowStyle(name, opts) {
  const N = 8, S = 128, [c, g] = cnv(N * S, N * S), [ce, ge] = cnv(N * S, N * S);
  const r = mulberry(name.length * 1337 + 7);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, N * S, N * S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, N * S, N * S);
  // subtle wall grain
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .05})`; g.fillRect(r() * N * S, r() * N * S, 3, 3); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i * S, y = j * S;
    const rects = opts.rects;
    for (const [rx, ry, rw, rh] of rects) {
      const X = x + rx * S, Y = y + ry * S, W = rw * S, H = rh * S;
      const gr = g.createLinearGradient(0, Y, 0, Y + H);
      gr.addColorStop(0, opts.glassTop); gr.addColorStop(1, opts.glassBot);
      g.fillStyle = gr; g.fillRect(X, Y, W, H);
      if (r() < .35) { g.fillStyle = `rgba(230,225,210,${.25 + r() * .3})`; g.fillRect(X, Y, W, H * (.2 + r() * .5)); } // blinds
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X, Y, W * .08, H); // glint
      if (opts.frame) { g.strokeStyle = opts.frame; g.lineWidth = 4; g.strokeRect(X, Y, W, H); }
      const lit = r() < opts.lit;
      if (lit) { const pal = ['#ffd38a', '#ffe6bd', '#ffc070', '#cfe6ff', '#ffd38a', '#ff9ee6', '#9ef3ff']; ge.fillStyle = pick.call(null, pal); ge.globalAlpha = .55 + r() * .45; ge.fillRect(X + 2, Y + 2, W - 4, H - 4); ge.globalAlpha = 1; }
    }
    if (opts.ledge) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + S * .86, S, S * .05); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x, y + S * .84, S, S * .03); }
  }
  const map = tex(c, { rep: true }), em = tex(ce, { rep: true });
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: .2, vertexColors: true, roughness: opts.rough ?? .7, metalness: opts.metal ?? 0, envMapIntensity: opts.env ?? .8 });
  winStyles[name] = { mat, geos: [] };
}
function makeWindowStyles() {
  makeWindowStyle('office', { rects: [[.12, .18, .76, .6]], glassTop: '#5d7fa3', glassBot: '#1c2a3d', lit: .45, ledge: true });
  makeWindowStyle('glass', { rects: [[.03, .04, .94, .92]], glassTop: '#c9dcf0', glassBot: '#5a7ea8', lit: .38, rough: .18, metal: .55, env: 1.3 });
  makeWindowStyle('res', { rects: [[.1, .22, .32, .55], [.58, .22, .32, .55]], glassTop: '#6d8fb3', glassBot: '#22324a', lit: .5, frame: '#ffffff', ledge: true });
  makeWindowStyle('deco', { rects: [[.18, .26, .64, .5]], glassTop: '#87b6d8', glassBot: '#27486b', lit: .6, frame: '#ffffff', ledge: true });
  onT(() => { const n = G.night; for (const k in winStyles) winStyles[k].mat.emissiveIntensity = lerp(.18, .95, n); });
}
// building primitive with real-world scaled UVs (texture tile = 24 m x 28 m)
function addBlock(style, x, y0, z, w, h, d, col, vOff = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const uo = Math.floor(R() * 8) / 8;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; let u = uv.getX(i), v = uv.getY(i);
    if (f === 2 || f === 3) { u = .004; v = .004; }
    else { const fw = (f < 2) ? d : w; u = u * fw / 24 + uo; v = v * h / 28 + vOff; }
    uv.setXY(i, u, v);
  }
  g.translate(x, y0 + h / 2, z); colorize(g, col);
  winStyles[style].geos.push(g);
}
function addCyl(style, x, y0, z, r, h, col, vOff = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, 28, 1, true);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r / 24, uv.getY(i) * h / 28 + vOff);
  g.translate(x, y0 + h / 2, z); colorize(g, col); winStyles[style].geos.push(g);
  const cap = new THREE.CircleGeometry(r, 28); cap.rotateX(-Math.PI / 2); cap.translate(x, y0 + h, z);
  const cu = cap.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, .004, .004);
  colorize(cap, col); winStyles[style].geos.push(cap);
}

const WV = (() => { const r = mulberry(99), o = []; for (let i = 0; i < 48; i++) { const f = 2 + Math.floor(r() * 22); const a = r() * TAU; o.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), 1.6 / (f ** 1.1), r() * TAU]); } return o; })();
function waterNormalTex() {
  const S = 256, [c, g] = cnv(S, S); const img = g.createImageData(S, S);
  const hgt = (x, y) => { let h = 0; for (const [a, b, amp, ph] of WV) h += amp * Math.sin(TAU * (a * x + b * y) / S + ph); return h; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const n = V(-dx * 3, -dy * 3, 1).normalize(); const i = (y * S + x) * 4;
    img.data[i] = (n.x * .5 + .5) * 255; img.data[i + 1] = (n.y * .5 + .5) * 255; img.data[i + 2] = (n.z * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c, { rep: true, srgb: false });
}
function hawaiianTex(base, flower, leaf) {
  const [c, g] = cnv(512, 512); g.fillStyle = base; g.fillRect(0, 0, 512, 512); const r = mulberry(base.length + flower.length * 3);
  for (let i = 0; i < 26; i++) { const x = r() * 512, y = r() * 512, a = r() * TAU; g.fillStyle = leaf; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 46, 14, 0, 0, TAU); g.fill(); g.restore(); }
  for (let i = 0; i < 22; i++) {
    const x = r() * 512, y = r() * 512, s = 16 + r() * 16, col = i % 3 === 0 ? '#fff4c2' : flower;
    g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p / 5 * TAU + i; g.beginPath(); g.arc(x + Math.cos(a) * s * .8, y + Math.sin(a) * s * .8, s * .62, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, s * .35, 0, TAU); g.fill();
  }
  return tex(c, { rep: true });
}

// ================================================================ CHARACTERS
const SKINS = ['#f5cba7', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0603a', '#f1c27d'];
const HAIRS = ['#2b1b10', '#5a3825', '#d9a441', '#151515', '#8a4b2a', '#e8e3dc', '#b5651d'];
const SHIRTS = ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#f8f9fa', '#8338ec', '#ff9f1c', '#2ec4b6', '#ff70a6', '#70d6ff', '#e9ff70'];
const PANTS = ['#2b2d42', '#3d5a80', '#e0c9a6', '#22223b', '#f1faee', '#6b705c', '#264653'];
const capsule = (r, l, a = 8, b = 14) => new THREE.CapsuleGeometry(r, l, a, b);

function makeCharacter(o = {}) {
  const full = o.full !== false;
  const skinM = new THREE.MeshStandardMaterial({ color: o.skin || '#f1c27d', roughness: .55 });
  const shirtM = o.shirtTex ? new THREE.MeshStandardMaterial({ map: o.shirtTex, roughness: .8 }) : std(o.shirt || '#ff6b6b', { roughness: .85 });
  const pantsM = std(o.pants || '#2b2d42', { roughness: .9 });
  const shoeM = std(o.shoes || '#f4f4f4', { roughness: .6 });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair || '#2b1b10', roughness: .55 });
  const whiteM = std('#ffffff', { roughness: .2 }), irisM = std(o.iris || '#3a2414', { roughness: .15 }), darkM = std('#4a0f18', { roughness: .6 });
  const chub = o.chub || 1;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(o.height || 1);
  const hips = new THREE.Group(); hips.position.y = .85; body.add(hips);
  const pelvis = mesh(new THREE.SphereGeometry(1, 16, 10), pantsM); pelvis.scale.set(.2 * chub, .14, .16 * chub); hips.add(pelvis);
  const torso = new THREE.Group(); hips.add(torso);
  const belly = mesh(new THREE.SphereGeometry(1, 24, 16), shirtM); belly.scale.set(.25 * chub, .32, .2 * chub); belly.position.y = .27; torso.add(belly);
  if (o.dress) { const sk = mesh(new THREE.ConeGeometry(.3, .5, 18, 1, true), shirtM); sk.position.y = -.05; torso.add(sk); }
  const neck = mesh(new THREE.CylinderGeometry(.065, .075, .14, 10), skinM); neck.position.y = .6; torso.add(neck);
  const head = new THREE.Group(); head.position.y = .82; torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(.27, 28, 20), skinM); skull.scale.set(1, 1.04, .96); head.add(skull);
  // eyes
  const eyes = [], lids = [], brows = [];
  for (const s of [1, -1]) {
    const eye = new THREE.Group(); eye.position.set(s * .1, .045, .215); head.add(eye);
    const w = mesh(new THREE.SphereGeometry(.078, 18, 14), whiteM, false); eye.add(w);
    const ir = mesh(new THREE.SphereGeometry(.042, 14, 10), irisM, false); ir.scale.z = .45; ir.position.z = .066; eye.add(ir);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.011, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(.016, .018, .085); eye.add(hl);
    eyes.push(eye);
    if (full) {
      const lid = mesh(new THREE.SphereGeometry(.084, 18, 8, 0, TAU, 0, Math.PI / 2), skinM, false); lid.material.side = THREE.DoubleSide; lid.position.copy(eye.position); head.add(lid); lids.push(lid);
      const br = mesh(capsule(.017, .075, 4, 8), hairM, false); br.rotation.z = Math.PI / 2; const bg = new THREE.Group(); bg.position.set(s * .1, .15, .245); bg.add(br); head.add(bg); brows.push(bg);
    }
  }
  const nose = mesh(new THREE.SphereGeometry(.058, 14, 10), skinM); nose.scale.set(1, .9, 1.05); nose.position.set(0, -.035, .27); head.add(nose);
  const mouth = new THREE.Group(); mouth.position.set(0, -.13, .225); mouth.rotation.x = .35; head.add(mouth);
  const smile = mesh(new THREE.TorusGeometry(.068, .013, 6, 20, Math.PI), darkM, false); smile.rotation.z = Math.PI; mouth.add(smile);
  const open = mesh(new THREE.SphereGeometry(1, 16, 10), darkM, false); open.scale.set(.07, .05, .03); mouth.add(open);
  const tongue = mesh(new THREE.SphereGeometry(1, 10, 8), std('#e2667a'), false); tongue.scale.set(.04, .02, .02); tongue.position.set(0, -.022, .01); open.add(tongue); tongue.scale.set(.55, .4, .7);
  const lips = mesh(new THREE.TorusGeometry(.03, .016, 8, 16), std('#d9546f', { roughness: .35 }), false); mouth.add(lips);
  for (const s of [1, -1]) { const ear = mesh(new THREE.SphereGeometry(.06, 10, 8), skinM); ear.scale.set(.45, 1, .75); ear.position.set(s * .265, 0, -.01); head.add(ear); }
  // hair styles
  const hairG = new THREE.Group(); head.add(hairG); const quiff = new THREE.Group(); hairG.add(quiff);
  const style = o.hairStyle || 'short';
  if (style !== 'bald' && style !== 'helmet') {
    const cap = mesh(new THREE.SphereGeometry(.285, 24, 12, 0, TAU, 0, 1.2), hairM); cap.rotation.x = -.42; hairG.add(cap);
  }
  if (style === 'quiff') { for (const [x, y, z, s] of [[0, .24, .13, 1], [.07, .22, .15, .8], [-.07, .225, .15, .85], [0, .27, .04, 1]]) { const q = mesh(new THREE.SphereGeometry(.1 * s, 12, 10), hairM); q.scale.set(1, .7, 1.15); q.position.set(x, y, z); quiff.add(q); } }
  if (style === 'long') { const b = mesh(new THREE.SphereGeometry(1, 16, 12), hairM); b.scale.set(.29, .36, .16); b.position.set(0, -.08, -.14); hairG.add(b); }
  if (style === 'bun') { const b = mesh(new THREE.SphereGeometry(.11, 12, 10), hairM); b.position.set(0, .25, -.14); hairG.add(b); }
  if (style === 'cap') { const cm = std(o.capColor || '#e63946'); const c = mesh(new THREE.SphereGeometry(.29, 20, 10, 0, TAU, 0, 1.3), cm); c.rotation.x = -.3; hairG.add(c); const brim = mesh(new THREE.CylinderGeometry(.2, .2, .02, 16, 1, false, -Math.PI / 2, Math.PI), cm); brim.position.set(0, .16, .17); brim.rotation.x = .2; hairG.add(brim); }
  if (style === 'helmet') { const hm = std(o.capColor || '#ffbe0b', { roughness: .3 }); const c = mesh(new THREE.SphereGeometry(.31, 20, 10, 0, TAU, 0, 1.4), hm); c.scale.set(1, .9, 1.15); c.rotation.x = -.25; hairG.add(c); }
  if (o.shades) { // sunglasses
    const sg = new THREE.Group(); const lm = std('#0b0b14', { roughness: .1, metalness: .6 });
    for (const s of [1, -1]) { const l = mesh(new THREE.CylinderGeometry(.068, .062, .02, 16), lm, false); l.rotation.x = Math.PI / 2; l.position.set(s * .1, 0, 0); l.scale.set(1.15, 1, .8); sg.add(l); }
    const br = mesh(boxGeo(.08, .015, .015), std(o.shadeFrame || '#ff2fd6'), false); sg.add(br);
    if (o.shades === 'head') { sg.position.set(0, .225, .18); sg.rotation.x = -.85; } else { sg.position.set(0, .05, .29); }
    head.add(sg);
  }
  // arms
  const arm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .24 * chub, .47, 0); torso.add(sh);
    const ua = mesh(capsule(.064, .18), o.longSleeve ? shirtM : shirtM); ua.position.y = -.13; sh.add(ua);
    const el = new THREE.Group(); el.position.y = -.29; sh.add(el);
    const fa = mesh(capsule(.052, .17), o.longSleeve ? shirtM : skinM); fa.position.y = -.12; el.add(fa);
    const hand = new THREE.Group(); hand.position.y = -.27; el.add(hand);
    const palm = mesh(new THREE.SphereGeometry(.068, 12, 10), skinM); palm.scale.set(.9, 1.1, .75); hand.add(palm);
    const thumb = mesh(capsule(.022, .05, 3, 6), skinM); thumb.position.set(-s * .055, -.01, .03); thumb.rotation.z = s * .7; hand.add(thumb);
    const fingers = new THREE.Group(); hand.add(fingers); fingers.visible = false;
    for (const k of [-1, 1]) { const f = mesh(capsule(.02, .09, 3, 6), skinM); f.position.set(k * .022, -.1, .01); f.rotation.z = k * .22; fingers.add(f); }
    return { sh, el, hand, fingers };
  };
  const L = arm(1), Rr = arm(-1);
  const leg = s => {
    const hp = new THREE.Group(); hp.position.set(s * .105 * chub, -.02, 0); hips.add(hp);
    const th = mesh(capsule(.088 * Math.sqrt(chub), .2), pantsM); th.position.y = -.17; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -.38; hp.add(kn);
    const sn = mesh(capsule(.064, .22), o.shorts ? skinM : pantsM); sn.position.y = -.19; kn.add(sn);
    const sh = mesh(new RoundedBoxGeometry(.14, .1, .27, 2, .04), shoeM); sh.position.set(0, -.41, .05); kn.add(sh);
    return { hp, kn };
  };
  const LL = leg(1), RL = leg(-1);
  let phone = null;
  if (o.phone) {
    phone = new THREE.Group(); const pb = mesh(new RoundedBoxGeometry(.085, .16, .014, 2, .006), std('#151520', { roughness: .3 }), false); phone.add(pb);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.072, .145), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.6, 2.0) })); scr.position.z = .008; phone.add(scr);
    const flash = new THREE.Mesh(new THREE.CircleGeometry(.01, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); flash.position.set(.025, .06, -.008); flash.rotation.y = Math.PI; phone.add(flash); phone.userData.flash = flash;
    phone.position.set(0, -.08, .05); Rr.hand.add(phone);
  }
  const ch = { root, body, hips, torso, head, eyes, lids, brows, mouth, smile, open, lips, L, R: Rr, LL, RL, phone, quiff, shirtM, skinM, hairM, belly, chub };
  ch.pose = p => applyPose(ch, p);
  return ch;
}
const BASE_POSE = { lSh: [0, 0, .1], rSh: [0, 0, -.1], lEl: [-.15, 0, 0], rEl: [-.15, 0, 0], head: [0, 0, 0], torso: [0, 0, 0], lHip: 0, rHip: 0, lKnee: 0, rKnee: 0, hipY: 0,
  eye: 1, pupil: 1, lid: -.25, browY: 0, browA: 0, smile: .45, open: 0, pucker: 0, look: [0, 0], peace: 0, phoneRot: [0, 0, 0] };
function mixPose(a, b, k) {
  const o = {}; for (const key in BASE_POSE) { const va = a[key] ?? BASE_POSE[key], vb = b[key] ?? BASE_POSE[key]; o[key] = Array.isArray(va) ? va.map((x, i) => lerp(x, vb[i], k)) : lerp(va, vb, k); } return o;
}
function poseSeq(t, keys) { // keys: [[time, pose], ...] with smooth blending of 0.25s around each key time
  let p = { ...BASE_POSE, ...keys[0][1] };
  for (let i = 1; i < keys.length; i++) { const [tk, pk, dur = .3] = keys[i]; const k = sm(tk - dur / 2, tk + dur / 2, t); if (k <= 0) break; p = mixPose(p, { ...BASE_POSE, ...pk }, k); }
  return p;
}
function applyPose(c, p) {
  c.L.sh.rotation.set(...p.lSh); c.R.sh.rotation.set(...p.rSh); c.L.el.rotation.set(...p.lEl); c.R.el.rotation.set(...p.rEl);
  c.head.rotation.set(...p.head); c.torso.rotation.set(...p.torso);
  c.LL.hp.rotation.x = p.lHip; c.RL.hp.rotation.x = p.rHip; c.LL.kn.rotation.x = p.lKnee; c.RL.kn.rotation.x = p.rKnee;
  c.hips.position.y = .85 + p.hipY;
  for (const e of c.eyes) { e.scale.setScalar(p.eye); e.rotation.set(-p.look[1], p.look[0], 0); e.children[1].scale.set(p.pupil, p.pupil, .45); }
  for (const l of c.lids) { l.rotation.x = p.lid; l.scale.setScalar(p.eye * 1.0); }
  c.brows.forEach((b, i) => { b.position.y = .15 + (p.eye - 1) * .07 + p.browY; b.rotation.z = (i === 0 ? 1 : -1) * p.browA; });
  const s = p.smile; c.smile.scale.set(1, Math.sign(s || 1) * Math.max(Math.abs(s), .1), 1); c.smile.position.y = s < 0 ? -.035 : 0;
  c.smile.visible = p.open < .2 && p.pucker < .3;
  c.open.visible = p.open >= .05; c.open.scale.set(.065 + p.open * .02, .015 + p.open * .06, .03);
  c.lips.visible = p.pucker > .05; c.lips.scale.setScalar(Math.max(p.pucker, .01));
  c.L.fingers.visible = p.peace > .5;
  if (c.phone) c.phone.rotation.set(...p.phoneRot);
}
function walkAdd(p, phase, amt, armSwing = 1) {
  const s = Math.sin(phase), c2 = Math.cos(phase);
  p.lHip += s * .55 * amt; p.rHip -= s * .55 * amt;
  p.lKnee += Math.max(0, -Math.sin(phase - .9)) * .9 * amt; p.rKnee += Math.max(0, Math.sin(phase - .9)) * .9 * amt;
  p.lSh = [p.lSh[0] - s * .45 * amt * armSwing, p.lSh[1], p.lSh[2]]; p.rSh = [p.rSh[0] + s * .45 * amt * armSwing, p.rSh[1], p.rSh[2]];
  p.hipY += (Math.abs(c2) * .045 - .02) * amt; p.torso = [p.torso[0] + .05 * amt, p.torso[1] + s * .06 * amt, p.torso[2]];
  return p;
}

// ================================================================ VEHICLES
const PAINTS = ['#f8f8f8', '#ff4f9a', '#19c2c9', '#121212', '#b9c2cc', '#e63946', '#a3ff3a', '#7b2ff7', '#ff8c1a', '#2a6df4', '#ffd23f', '#f2e9e4', '#1b998b'];
const paintCache = new Map();
function paint(col) { if (!paintCache.has(col)) paintCache.set(col, new THREE.MeshPhysicalMaterial({ color: col, metalness: .45, roughness: .32, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.2 })); return paintCache.get(col); }
const glassM = new THREE.MeshStandardMaterial({ color: 0x0c1422, metalness: .9, roughness: .06, envMapIntensity: 1.5 });
const trimM = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: .55, metalness: .2 });
const wheelM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .5 });
const beamM = additive(glowTex, 0xfff1d0, 0);
const CARS = {
  sports: { L: 4.5, W: 1.95, wr: .36, wx: [1.42, -1.38], wy: .36,
    body: [[-2.25, .32], [-2.3, .62], [-2.2, .86], [-1.6, .92], [-.9, .9], [1.0, .86], [1.7, .74], [2.2, .62], [2.32, .45], [2.25, .28]], ar: .43,
    cabin: [[-1.55, .86], [-.65, 1.16], [.2, 1.19], [1.05, .86]], cw: 1.5, head: [2.16, .64, .62, -.45], tail: [-2.28, .74] },
  sedan: { L: 4.7, W: 1.85, wr: .36, wx: [1.45, -1.45], wy: .36,
    body: [[-2.35, .34], [-2.38, .72], [-2.25, .98], [-1.3, 1.0], [1.15, .98], [2.2, .9], [2.36, .65], [2.3, .32]], ar: .42,
    cabin: [[-1.95, .97], [-1.25, 1.44], [.45, 1.46], [1.2, .97]], cw: 1.58, roof: [-.4, 1.49, 1.62], head: [2.3, .74, .6, 0], tail: [-2.36, .84] },
  suv: { L: 4.8, W: 1.95, wr: .44, wx: [1.5, -1.5], wy: .44,
    body: [[-2.4, .45], [-2.42, .95], [-2.3, 1.15], [1.25, 1.15], [2.25, 1.02], [2.42, .75], [2.35, .42]], ar: .5,
    cabin: [[-2.25, 1.12], [-2.12, 1.74], [.6, 1.77], [1.32, 1.12]], cw: 1.72, roof: [-.75, 1.8, 2.7], head: [2.36, .88, .62, 0], tail: [-2.4, 1.0] },
};
CARS.taxi = CARS.sedan;
function extrudeProfile(pts, width, arches) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  if (arches) { for (const [cx, cy, r] of arches) { const a0 = Math.asin(clamp((pts[pts.length - 1][1] - cy) / r, -1, 1)); sh.lineTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); sh.absarc(cx, cy, r, a0, Math.PI - a0, false); } sh.lineTo(pts[0][0], pts[0][1] - 0.02); }
  const bev = .07; const g = new THREE.ExtrudeGeometry(sh, { depth: width - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bev * 2) / 2); g.computeVertexNormals(); return g;
}
const carGeoCache = {};
function carGeos(type) {
  if (carGeoCache[type]) return carGeoCache[type];
  const S = CARS[type];
  const body = extrudeProfile(S.body, S.W, [[S.wx[0], S.wy, S.ar + .02], [S.wx[1], S.wy, S.ar + .02]]);
  const parts = { body: [body], glass: [extrudeProfile(S.cabin, S.cw)], trim: [], head: [], tail: [] };
  if (S.roof) parts.body.push(new RoundedBoxGeometry(S.roof[2], .07, S.cw + .04, 2, .03).translate(S.roof[0], S.roof[1], 0));
  const [hx, hy, hz, hr] = S.head;
  for (const s of [1, -1]) { const h = new RoundedBoxGeometry(.24, .09, .42, 2, .03); h.rotateZ(hr); h.translate(hx, hy, s * hz); parts.head.push(h); }
  const [tx, ty] = S.tail;
  if (type === 'sports') { parts.tail.push(boxGeo(.06, .06, 1.7, tx, ty, 0)); parts.trim.push(boxGeo(.4, .04, 1.86, -1.95, 1.1, 0), boxGeo(.08, .22, .06, -1.95, .98, .6), boxGeo(.08, .22, .06, -1.95, .98, -.6)); parts.trim.push(boxGeo(.5, .14, S.W + .02, -.35, .5, 0)); parts.trim.push(boxGeo(.08, .2, 1.3, 2.28, .36, 0)); }
  else { for (const s of [1, -1]) parts.tail.push(boxGeo(.06, .16, .4, tx, ty, s * .6)); parts.trim.push(boxGeo(.14, .2, S.W + .04, S.body[S.body.length - 1][0] + .02, .42 + (type === 'suv' ? .1 : 0), 0), boxGeo(.14, .2, S.W + .04, S.body[0][0] - .02, .42 + (type === 'suv' ? .1 : 0), 0)); parts.trim.push(boxGeo(.06, .18, 1.0, S.body[S.body.length - 2][0] + .02, hy - .05, 0)); }
  for (const s of [1, -1]) parts.trim.push(boxGeo(.18, .1, .12, S.cabin[3][0] - .15, S.cabin[3][1] + .08, s * (S.W / 2 + .03)));
  const out = {}; for (const k in parts) out[k] = parts[k].length ? merge(parts[k]) : null;
  // wheel: tire + rim with spokes, vertex coloured
  const tire = colorize(new THREE.CylinderGeometry(S.wr, S.wr, .26, 24).rotateX(Math.PI / 2), '#161616');
  const tor = colorize(new THREE.TorusGeometry(S.wr - .04, .05, 8, 24).scale(1, 1, 1.6), '#161616');
  const rim = colorize(new THREE.CylinderGeometry(S.wr * .68, S.wr * .68, .27, 20).rotateX(Math.PI / 2), type === 'taxi' ? '#9aa0a8' : '#d8dde4');
  const spokes = []; for (let i = 0; i < 5; i++) { const sp = boxGeo(.05, S.wr * 1.25, .04, 0, 0, .14); sp.rotateZ(i / 5 * TAU); spokes.push(colorize(sp, '#eceff2')); }
  const hub = colorize(new THREE.CylinderGeometry(.05, .05, .29, 10).rotateX(Math.PI / 2), '#ff2f5a');
  out.wheel = merge([tire, tor, rim, ...spokes, hub]);
  out.beam = (() => { const g = new THREE.PlaneGeometry(14, 4.2); g.rotateX(-Math.PI / 2); g.translate(S.L / 2 + 6.5, .06, 0); return g; })();
  carGeoCache[type] = out; return out;
}
function makeCar(type, color, { lod = false } = {}) {
  const S = CARS[type], g = carGeos(type);
  const grp = new THREE.Group(), chassis = new THREE.Group(); grp.add(chassis);
  chassis.add(mesh(g.body, paint(color)));
  chassis.add(mesh(g.glass, glassM, !lod));
  if (!lod) chassis.add(mesh(g.trim, trimM));
  chassis.add(mesh(g.head, lightMats.head, false, false)); chassis.add(mesh(g.tail, lightMats.tail, false, false));
  if (type === 'taxi') { const sign = mesh(boxGeo(.32, .22, .8, -.35, 1.62, 0), new THREE.MeshBasicMaterial({ map: boardTex('TAXI', '#fff4c4', '#1a1a1a', { w: 256, h: 64, size: 50 }), color: 0xffffff }), false); chassis.add(sign); sign.material.userData.isSign = true; taxiSigns.push(sign.material); for (const s of [1, -1]) chassis.add(mesh(boxGeo(2.9, .1, .02, .1, .72, s * .935), std('#111111'), false)); }
  const wheels = [];
  if (!lod) for (const x of S.wx) for (const s of [1, -1]) { const w = new THREE.Group(); w.position.set(x, S.wy, s * (S.W / 2 - .12)); const m = mesh(g.wheel, wheelM); if (s < 0) m.rotation.y = Math.PI; w.add(m); grp.add(w); wheels.push(w); }
  const beam = mesh(g.beam, beamM, false, false); grp.add(beam);
  const car = { grp, chassis, wheels, S, type,
    spin(a) { for (const w of wheels) w.children[0].rotation.z = (w.position.z < 0 ? 1 : -1) * a; },
    steer(a) { for (const w of wheels) if (w.position.x > 0) w.rotation.y = a; },
    place(x, z, yaw, dist, pitch = 0, roll = 0) { grp.position.set(x, 0, z); grp.rotation.y = yaw; this.spin(dist / S.wr); chassis.rotation.set(roll, 0, pitch); }
  };
  scene.add(grp); return car;
}
const taxiSigns = [];
// motion: distance along heading for a car that brakes to a stop at ps at time ts and pulls away at tr
function stopper(v, ps, ts, tb, tr = 1e9, a = 3.5) {
  return t => {
    if (t < ts - tb) return ps - v * tb / 2 - v * (ts - tb - t);
    if (t < ts) return ps - v / (2 * tb) * (ts - t) ** 2;
    if (t < tr) return ps;
    const d = t - tr, ta = v / a; return d < ta ? ps + .5 * a * d * d : ps + v * ta / 2 + v * (d - ta);
  };
}
const pitchFrom = (f, t) => { const w = .22, h = .05; const v1 = (f(t + w + h) - f(t + w - h)) / (2 * h), v0 = (f(t - w + h) - f(t - w - h)) / (2 * h); const acc = (v1 - v0) / (2 * w); return clamp(-acc * .0075, -.05, .05); };
const HEAD = { px: 0, nx: Math.PI, pz: -Math.PI / 2, nz: Math.PI / 2 };

// two-wheelers
function makeBike(frameCol) {
  const g = new THREE.Group(); const fm = std(frameCol, { roughness: .35, metalness: .4 }), dk = std('#1b1b1b');
  const wheels = [];
  for (const x of [.52, -.52]) { const w = new THREE.Group(); w.position.set(x, .34, 0); const tire = mesh(new THREE.TorusGeometry(.32, .028, 8, 28), dk); w.add(tire); const sp = []; for (let i = 0; i < 9; i++) { sp.push(rodGeo(V(0, 0, 0), V(Math.cos(i / 9 * TAU) * .31, Math.sin(i / 9 * TAU) * .31, 0), .004, 4)); } w.add(mesh(merge(sp), std('#cccccc', { metalness: .8, roughness: .3 }), false)); g.add(w); wheels.push(w); }
  const P = { bb: V(0, .32, 0), seat: V(-.18, .9, 0), head: V(.4, .95, 0), rear: V(-.52, .34, 0), front: V(.52, .34, 0) };
  const tubes = [[P.bb, P.seat], [P.bb, P.head], [P.seat, P.head], [P.bb, P.rear], [P.seat, P.rear], [P.head, P.front]].map(([a, b]) => rodGeo(a, b, .022));
  g.add(mesh(merge(tubes), fm));
  g.add(mesh(new RoundedBoxGeometry(.24, .05, .11, 2, .02).translate(-.2, .95, 0), dk));
  g.add(mesh(rodGeo(V(.4, 1.05, -.26), V(.4, 1.05, .26), .018), dk));
  g.add(mesh(rodGeo(P.head, V(.4, 1.05, 0), .02), fm));
  const crank = new THREE.Group(); crank.position.copy(P.bb); g.add(crank); crank.add(mesh(rodGeo(V(0, -.17, .08), V(0, .17, -.08), .015), std('#999', { metalness: .9 })));
  return { g, wheels, crank };
}
function makeMoto(col) {
  const g = new THREE.Group(); const pm = paint(col), dk = std('#151515');
  const wheels = [];
  for (const x of [.72, -.7]) { const w = new THREE.Group(); w.position.set(x, .32, 0); const m = mesh(new THREE.TorusGeometry(.26, .07, 10, 24), dk); w.add(m); w.add(mesh(new THREE.CylinderGeometry(.18, .18, .08, 12).rotateX(Math.PI / 2), std('#bbb', { metalness: .9, roughness: .3 }))); g.add(w); wheels.push(w); }
  g.add(mesh(new THREE.CapsuleGeometry(.17, .5, 6, 12).rotateZ(Math.PI / 2 + .15).translate(.1, .72, 0), pm));
  g.add(mesh(new RoundedBoxGeometry(.6, .1, .26, 2, .04).translate(-.3, .78, 0), dk));
  g.add(mesh(rodGeo(V(.72, .32, 0), V(.5, 1.0, 0), .035), std('#aaa', { metalness: .9 })));
  g.add(mesh(rodGeo(V(.5, 1.02, -.32), V(.5, 1.02, .32), .02), dk));
  g.add(mesh(new THREE.SphereGeometry(.09, 10, 8).translate(.62, .88, 0), lightMats.head, false));
  g.add(mesh(boxGeo(.04, .06, .14, -.75, .7, 0), lightMats.tail, false));
  return { g, wheels };
}
function riderPose(c, crankA, lean = .55) {
  const p = { ...BASE_POSE };
  p.torso = [lean, 0, 0]; p.head = [-lean + .1, 0, 0];
  p.lSh = [-1.25 + lean * .5, 0, .05]; p.rSh = [-1.25 + lean * .5, 0, -.05]; p.lEl = [-.2, 0, 0]; p.rEl = [-.2, 0, 0];
  p.lHip = -1.1 + Math.sin(crankA) * .42; p.rHip = -1.1 - Math.sin(crankA) * .42;
  p.lKnee = 1.25 + Math.cos(crankA) * .35; p.rKnee = 1.25 - Math.cos(crankA) * .35; p.smile = .7;
  c.pose(p);
}

// ================================================================ BUILD THE WORLD
const palms = [], lamps = [];
function buildSuburbs() {
  const r = mulberry(555); const items = [];
  for (let i = 0; i < 2600; i++) {
    let x = -1400 + r() * 1450, z = -1400 + r() * 2800;
    if (x > -275 && Math.abs(z) < 335) continue; if (x > 24) continue;
    const d = Math.hypot(x + 120, z); const h = 5 + r() * 14 + (d < 600 ? r() * 30 * (1 - d / 600) : 0);
    items.push([x, z, 8 + r() * 14, h, 8 + r() * 14]);
  }
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0);
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: .8 }), items.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  items.forEach(([x, z, w, h, d], i) => { m.compose(V(x, 0, z), new THREE.Quaternion(), V(w, h, d)); im.setMatrixAt(i, m); im.setColorAt(i, c.set(DECO[i % DECO.length]).multiplyScalar(.8)); });
  im.receiveShadow = true; scene.add(im);
  const tg = new THREE.IcosahedronGeometry(1, 0); const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: .9, flatShading: true }), 1800);
  for (let i = 0; i < 1800; i++) { let x = -1400 + r() * 1450, z = -1400 + r() * 2800; if ((x > -275 && Math.abs(z) < 335) || x > 24) { x = -300 - r() * 900; } const s = 3 + r() * 4; m.compose(V(x, s * .8, z), new THREE.Quaternion(), V(s, s * 1.2, s)); tm.setMatrixAt(i, m); }
  scene.add(tm);
  // night windows of the suburbs: sparse emissive dots
  const lg = new THREE.PlaneGeometry(1, 1); const lm = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), items.length);
  items.forEach(([x, z, w, h, d], i) => { m.compose(V(x + w / 2 + .05, h * .6, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2), V(w * .6, h * .35, 1)); lm.setMatrixAt(i, m); lm.setColorAt(i, c.setHSL(.1 + r() * .05, .8, .55)); });
  scene.add(lm); onT(() => { lm.material.color.setScalar(G.night * 1.2); lm.visible = G.night > .05; });
}
function buildGround() {
  const base = mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2).translate(-1500 + 50, 0, 0), std('#6d7563', { roughness: .95 }), false, true); scene.add(base);
  buildSuburbs();
  // blocks (sidewalk slabs)
  const slabs = [], swM = std('#c9c4bb', { roughness: .9 });
  const zs = STREETS_X; const xs = STREETS_Z;
  for (let j = 0; j < xs.length; j++) for (let k = 0; k < zs.length - 1; k++) {
    const x0 = xs[j] - 40 + ROAD_W / 2, x1 = xs[j] - ROAD_W / 2; const z0 = zs[k] + ROAD_W / 2, z1 = zs[k + 1] - ROAD_W / 2;
    slabs.push(boxGeo(x1 - x0, .15, z1 - z0, (x0 + x1) / 2, .075, (z0 + z1) / 2));
  }
  for (let k = 0; k < zs.length - 1; k++) { const z0 = zs[k] + 5, z1 = zs[k + 1] - 5; slabs.push(boxGeo(BLVD.x0 - 5, .15, z1 - z0, (5 + BLVD.x0) / 2, .075, (z0 + z1) / 2)); }
  slabs.push(boxGeo(BLVD.x0 - 5, .15, 40, (5 + BLVD.x0) / 2, .075, -320 + 20 - 40)); // fill ends
  scene.add(mesh(merge(slabs), swM, false, true));
  // promenade
  scene.add(mesh(boxGeo(PROM.x1 - PROM.x0, .15, 1200, (PROM.x0 + PROM.x1) / 2, .075, 0), std('#e8dcc8', { roughness: .85 }), false, true));
  const bikeLane = mesh(new THREE.PlaneGeometry(1.8, 1200).rotateX(-Math.PI / 2).translate(44.2, .152, 0), std('#c4524a', { roughness: .8 }), false, true); scene.add(bikeLane);
  scene.add(mesh(boxGeo(.25, .25, 1200, PROM.x1 - .1, .12, 0), std('#f4efe6'), false, true));
  // roads
  const roadStrip = (mat, w, len, x, z, alongZ, y = .02, rep = 8) => { const g = new THREE.PlaneGeometry(w, len); g.rotateX(-Math.PI / 2); if (!alongZ) g.rotateY(Math.PI / 2); g.translate(x, y, z); const m = mat.clone(); m.map = mat.map.clone(); m.map.repeat.set(1, len / rep); m.map.needsUpdate = true; const r = mesh(g, m, false, true); scene.add(r); onT(() => { m.roughness = mat.roughness; m.envMapIntensity = mat.envMapIntensity; }); return r; };
  for (const x of xs) roadStrip(roadMat.city, ROAD_W, 640, x, 0, true);
  for (const z of zs) roadStrip(roadMat.city, ROAD_W, 270, -120 + 2.5, z, false, .021);
  for (const z of zs) roadStrip(roadMat.city, 23, 10, 16.5, z, false, .021, 10);
  roadStrip(roadMat.blvd, 14, 1200, 35, 0, true, .02, 8);
  const inters = []; for (const x of xs) for (const z of zs) inters.push(new THREE.PlaneGeometry(ROAD_W, ROAD_W).rotateX(-Math.PI / 2).translate(x, .03, z)); for (const z of zs) inters.push(new THREE.PlaneGeometry(14, ROAD_W).rotateX(-Math.PI / 2).translate(35, .03, z));
  scene.add(mesh(merge(inters), roadMat.inter, false, true));
  // crosswalks
  const cw = []; const zebra = (x, z, w, along) => { for (let i = -4; i <= 4; i++) cw.push(along ? boxGeo(w, .01, .5, x + i * 1.05, .035, z) : boxGeo(.5, .01, w, x, .035, z + i * 1.05)); };
  for (const z of [0, -20 + 40, 20 - 40]) { if (z === 0) { for (let i = 0; i < 9; i++) cw.push(boxGeo(.55, .012, 3.2, -44.2 + i * 1.05, .036, 0)); } }
  for (const x of [-40, 0]) for (const z of [20, -20, 60]) { for (let i = 0; i < 8; i++) cw.push(boxGeo(.55, .012, 3, x - 3.7 + i * 1.05, .036, z - 6.6)); }
  scene.add(mesh(merge(cw), std('#f2f2f2', { roughness: .6 }), false, true));
  // sand + sea
  const sand = new THREE.PlaneGeometry(260, 3000, 130, 1); sand.rotateX(-Math.PI / 2); sand.translate(50 + 130, 0, 0);
  const sp = sand.attributes.position; for (let i = 0; i < sp.count; i++) { const x = sp.getX(i); sp.setY(i, .14 - Math.max(0, x - 62) * .04 - Math.max(0, x - 90) * .03); } sand.computeVertexNormals();
  const sandM = new THREE.MeshStandardMaterial({ color: '#f3d9a4', roughness: .95, map: (() => { const [c, g] = cnv(256, 256); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); const r = mulberry(5); for (let i = 0; i < 9000; i++) { const v = 200 + r() * 55; g.fillStyle = `rgb(${v},${v - 8},${v - 25})`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); } const t = tex(c, { rep: true }); t.repeat.set(40, 400); return t; })() });
  scene.add(mesh(sand, sandM, false, true));
  const wn = waterNormalTex(); wn.repeat.set(220, 220);
  const waterM = new THREE.MeshStandardMaterial({ color: '#0f6f8c', roughness: .07, metalness: .05, normalMap: wn, normalScale: new THREE.Vector2(.22, .22), envMapIntensity: 1.25 });
  const water = mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2).translate(2000 + 55, -.15, 0), waterM, false, true); scene.add(water);
  const wn2 = wn;
  onT(t => { wn2.offset.set(t * .012, t * .006); waterM.color.set(G.night > .5 ? '#08263a' : '#0f6f8c').lerp(new THREE.Color('#0a3550'), G.night * .5); });
  // shore foam
  const [fc, fg] = cnv(512, 64); const fr = mulberry(9); for (let i = 0; i < 700; i++) { fg.fillStyle = `rgba(255,255,255,${.25 + fr() * .6})`; fg.beginPath(); fg.ellipse(fr() * 512, 20 + fr() * 30, 3 + fr() * 10, 2 + fr() * 3, 0, 0, TAU); fg.fill(); }
  const foamT = tex(fc, { rep: true }); foamT.repeat.set(1, 1);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3.2).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(69.7, -.11, 0), new THREE.MeshStandardMaterial({ map: foamT, transparent: true, opacity: .85, roughness: .5, depthWrite: false }));
  foamT.repeat.set(120, 1); scene.add(foam);
  onT(t => { foamT.offset.set(t * .01, Math.sin(t * .9) * .08); foam.position.x = Math.sin(t * .9) * .6; });
  // puddle (scene 4)
  const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#486f8a', roughness: .03, metalness: .6, transparent: true, opacity: .85, envMapIntensity: 1.6 }));
  pud.scale.set(1.1, 1, .8); pud.position.copy(PUDDLE); pud.receiveShadow = true; scene.add(pud);
}

// ------------------------------------------------ palms (instanced)
function buildPalmAssets() {
  const trunkPts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; trunkPts.push(V(Math.sin(u * 1.3) * .9 * u, u * 9, 0)); }
  const curve = new THREE.CatmullRomCurve3(trunkPts);
  const trunk = new THREE.TubeGeometry(curve, 24, .2, 8, false);
  const pos = trunk.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const s = 1.25 - y / 9 * .45 + (Math.sin(y * 9) > .6 ? .05 : 0); const c = curve.getPoint(clamp(y / 9)); pos.setX(i, c.x + (pos.getX(i) - c.x) * s); pos.setZ(i, pos.getZ(i) * s); }
  trunk.computeVertexNormals();
  const top = curve.getPoint(1);
  const fronds = [];
  for (let i = 0; i < 9; i++) {
    const fr = new THREE.PlaneGeometry(3.6, .9, 10, 2); const p = fr.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 1.8, y = p.getY(k); const w = Math.sin(clamp(x / 3.6) * Math.PI) * (1 - x / 4.6) + .08; p.setXYZ(k, x, -x * x * .085, y * w * 1.25); }
    fr.rotateX(-.25 + (i % 2) * .5); fr.rotateZ(.32 + (i % 3) * .14); fr.rotateY(i / 9 * TAU + .3); fr.translate(top.x, top.y, top.z); fr.computeVertexNormals(); fronds.push(fr);
  }
  for (let i = 0; i < 4; i++) fronds.push(new THREE.SphereGeometry(.22, 8, 6).translate(top.x + Math.cos(i * 1.6) * .25, top.y - .25, Math.sin(i * 1.6) * .25));
  const crown = merge(fronds);
  const [c, g] = cnv(64, 256); g.fillStyle = '#8b6b4a'; g.fillRect(0, 0, 64, 256); for (let y = 0; y < 256; y += 12) { g.fillStyle = '#5e4630'; g.fillRect(0, y, 64, 3); g.fillStyle = '#a3835e'; g.fillRect(0, y + 3, 64, 2); }
  const trunkM = new THREE.MeshStandardMaterial({ map: tex(c), roughness: .95 });
  const frondM = new THREE.MeshStandardMaterial({ color: '#3f9a3a', roughness: .7, side: THREE.DoubleSide });
  return { trunk, crown, trunkM, frondM };
}
function placePalm(x, z, s = 1, rot = R() * TAU) { palms.push({ x, z, s: s * rr(.85, 1.15), rot }); }
function buildPalms() {
  const A = buildPalmAssets(); const n = palms.length;
  const tr = new THREE.InstancedMesh(A.trunk, A.trunkM, n), cr = new THREE.InstancedMesh(A.crown, A.frondM, n);
  tr.castShadow = cr.castShadow = true; tr.receiveShadow = cr.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(); const tint = new THREE.Color();
  palms.forEach((p, i) => { q.setFromAxisAngle(V(0, 1, 0), p.rot); m.compose(V(p.x, .1, p.z), q, V(p.s, p.s, p.s)); tr.setMatrixAt(i, m); cr.setMatrixAt(i, m); cr.setColorAt(i, tint.setHSL(.29 + R() * .06, .55, .32 + R() * .1)); });
  scene.add(tr, cr);
  // sway
  const q2 = new THREE.Quaternion();
  onT(t => { if (G.skipSway) return; palms.forEach((p, i) => { const sw = Math.sin(t * 1.3 + i) * .02; q.setFromAxisAngle(V(0, 1, 0), p.rot); q2.setFromAxisAngle(V(1, 0, 0), sw); q.multiply(q2); m.compose(V(p.x, .1, p.z), q, V(p.s, p.s, p.s)); cr.setMatrixAt(i, m); }); cr.instanceMatrix.needsUpdate = true; });
}
// ------------------------------------------------ lamps (instanced)
function buildLamps() {
  const pole = merge([new THREE.CylinderGeometry(.08, .12, 7, 8).translate(0, 3.5, 0), rodGeo(V(0, 6.9, 0), V(1.6, 7.1, 0), .06), new THREE.CylinderGeometry(.25, .25, .15, 10).translate(0, .07, 0)]);
  const head = new RoundedBoxGeometry(.7, .14, .32, 2, .05).translate(1.7, 7.02, 0);
  const n = lamps.length; const pm = new THREE.InstancedMesh(pole, std('#2c2f36', { metalness: .6, roughness: .4 }), n), hm = new THREE.InstancedMesh(head, lightMats.lamp, n);
  const gl = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), additive(glowTex, 0xffb870, 0), n);
  pm.castShadow = true; const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  lamps.forEach((l, i) => { q.setFromAxisAngle(V(0, 1, 0), l.rot); m.compose(V(l.x, .1, l.z), q, V(1, 1, 1)); pm.setMatrixAt(i, m); hm.setMatrixAt(i, m); const off = V(1.7, 0, 0).applyQuaternion(q); m.compose(V(l.x + off.x, .05, l.z + off.z), new THREE.Quaternion(), V(1, 1, 1)); gl.setMatrixAt(i, m); });
  scene.add(pm, hm, gl);
  onT(() => { const k = sm(.35, .7, G.night); lightMats.lamp.color.setRGB(lerp(.9, 3.2, k), lerp(.8, 2.5, k), lerp(.65, 1.6, k)); gl.material.opacity = k * .4; });
}

// ------------------------------------------------ city blocks
const DECO = ['#ffb3c7', '#9ee6e0', '#ffe5a0', '#c9b6ff', '#a8e6a1', '#ffc8a2', '#f7f3e8', '#8fd3ff', '#ff9fb5'];
const TOWER_TINTS = ['#e8eef5', '#bcd7ee', '#9fd3d0', '#f3dcb0', '#d8d0f0', '#ffffff', '#c7e0ff', '#f0c9a0'];
const SHOPS = [
  ['NEON BURGER', '#ff3b6b', 'neon'], ['PALM CAFÉ', '#2a9d8f', 'board'], ['TACO WAVE', '#ff9f1c', 'neon'], ['BAY SHADES', '#7b2ff7', 'board'],
  ['PIXEL ARCADE', '#2ef2ff', 'neon'], ['GELATO GO', '#ff70a6', 'board'], ['SURF SHACK', '#118ab2', 'board'], ['MANGO JUICE', '#ffbe0b', 'neon'],
  ['CORAL BOUTIQUE', '#e76f51', 'board'], ['PINK FLAMINGO DINER', '#ff2fd6', 'neon'], ['SUNSET SOUVENIRS', '#f4a261', 'board'], ['NIGHT OWL BAR', '#9d4edd', 'neon']];
const neonList = []; // {mat, base(Color), t0} — flicker on at night
function addNeon(mat, color, t0 = rr(33.2, 37.2), dayK = .9) { neonList.push({ mat, col: new THREE.Color(color), t0, dayK, seed: R() * 100 }); }
function buildTower(x, z, w, d, h, rnd) {
  const style = rnd < .45 ? 'glass' : rnd < .8 ? 'office' : 'res';
  const tint = style === 'glass' ? pick(TOWER_TINTS) : pick(['#f2efe8', '#e6ddd0', '#d7e3ea', '#efe2d3', '#f6e8f0', '#ddd8cf']);
  const form = R();
  if (form < .18 && h > 50) { const r = Math.min(w, d) / 2; addCyl(style, x, 0, z, r, h, tint); roofStuff(x, z, r * 1.2, r * 1.2, h, true); }
  else if (form < .55 && h > 40) { // setbacks
    let y = 0, ww = w, dd = d, hh = h * .55; let v = 0;
    for (let k = 0; k < 3 && hh > 6; k++) { addBlock(style, x, y, z, ww, hh, dd, tint, v); v += hh / 28; y += hh; ww *= .78; dd *= .78; hh = (h - y) * .6 + 4; if (k === 2) break; }
    roofStuff(x, z, ww, dd, y, true);
  } else { addBlock(style, x, 0, z, w, h, d, tint); roofStuff(x, z, w, d, h, h > 60); }
}
const roofGeos = [], spireGeos = [], beaconGeos = [];
function roofStuff(x, z, w, d, h, spire) {
  for (let i = 0; i < ri(1, 3); i++) roofGeos.push(boxGeo(rr(1.5, 3), rr(1, 2.2), rr(1.5, 3), x + rr(-w / 4, w / 4), h + .8, z + rr(-d / 4, d / 4)));
  roofGeos.push(boxGeo(w + .4, .6, d + .4, x, h + .3, z).scale(1, 1, 1));
  if (spire) { const sh = rr(8, 22); spireGeos.push(new THREE.CylinderGeometry(.12, .35, sh, 6).translate(x, h + sh / 2, z)); beaconGeos.push(new THREE.SphereGeometry(.45, 8, 6).translate(x, h + sh, z)); }
}
function buildDowntown() {
  const C = V(-120, 0, -10);
  for (let j = 0; j < STREETS_Z.length; j++) for (let k = 0; k < STREETS_X.length - 1; k++) {
    const x0 = STREETS_Z[j] - 40 + ROAD_W / 2 + 3.5, x1 = STREETS_Z[j] - ROAD_W / 2 - 3.5;
    const z0 = STREETS_X[k] + ROAD_W / 2 + 3.5, z1 = STREETS_X[k + 1] - ROAD_W / 2 - 3.5;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (Math.abs(cz - HWY_Z) < 10) { // highway corridor -> parking lot w/ some palms
      for (let i = 0; i < 3; i++) placePalm(cx + rr(-10, 10), cz + rr(-8, 8));
      continue;
    }
    const shopBlock = (j === 0 || j === 1) && Math.abs(cz) < 70;
    if (shopBlock) { buildShopBlock(j, x0, x1, z0, z1); continue; }
    const dist = Math.hypot(cx - C.x, (cz - C.z) * .8);
    const f = Math.exp(-((dist / 110) ** 2));
    const split = R(); const lots = [];
    if (split < .35) lots.push([cx, cz, x1 - x0, z1 - z0]);
    else if (split < .7) { const m = lerp(z0, z1, rr(.4, .6)); lots.push([cx, (z0 + m) / 2, x1 - x0, m - z0 - 1.5], [cx, (m + z1) / 2, x1 - x0, z1 - m - 1.5]); }
    else { const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; for (const a of [[x0, mx], [mx, x1]]) for (const b of [[z0, mz], [mz, z1]]) lots.push([(a[0] + a[1]) / 2, (b[0] + b[1]) / 2, a[1] - a[0] - 1.5, b[1] - b[0] - 1.5]); }
    for (const [lx, lz, lw, ld] of lots) {
      const h = 10 + f * rr(60, 190) + rr(0, 22) * (1 - f * .5) + (R() < .08 ? 60 * f : 0);
      buildTower(lx, lz, lw * rr(.82, 1), ld * rr(.82, 1), h, R());
    }
    if (R() < .5) placePalm(x0 - 1.8, z0 - 1.8);
  }
}
// shopping street (scene 2): x = -40 street, east block j=0 (x -35..-5), west block j=1 (x -75..-45)
const awningGeos = {}; const shopSignMeshes = [];
function stripeTex(c1, c2) { const [c, g] = cnv(128, 64); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * 16, 0, 16, 64); } g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 128, 8); return tex(c, { rep: true }); }
function buildShopBlock(j, x0, x1, z0, z1) {
  const east = j === 0; // east block's shopfront faces -x (towards x=-40)
  const fx = east ? x0 : x1; const dir = east ? -1 : 1; // facade x and outward direction
  let z = z0; let si = (j * 7 + Math.round(z0)) & 255;
  while (z < z1 - 4) {
    const w = Math.min(rr(7, 11), z1 - z); const cz = z + w / 2; const floors = ri(2, 5); const h = 4.2 + floors * 3.3;
    const col = pick(DECO); const depth = rr(10, 14);
    addBlock(pick(['res', 'deco', 'office']), fx - dir * depth / 2, 0, cz, depth, h, w - .2, col, -4.2 / 28 + .02);
    // ground floor storefront
    const shop = SHOPS[(si++) % SHOPS.length];
    const gf = mesh(boxGeo(.25, 3.4, w - 1.0, fx + dir * .05, 1.85, cz), storefrontMat(w - 1.0), false, true); scene.add(gf); shopWindows.push(gf.material);
    // awning
    const ac = pick([['#ff4f8b', '#fff'], ['#19c2c9', '#fff'], ['#ffbe0b', '#fff'], ['#7b2ff7', '#fff'], ['#2a9d8f', '#f1faee'], ['#e63946', '#fff']]);
    const key = ac.join(); if (!awningGeos[key]) awningGeos[key] = { mat: new THREE.MeshStandardMaterial({ map: stripeTex(...ac), roughness: .8, side: THREE.DoubleSide }), geos: [] };
    const aw = new THREE.PlaneGeometry(2.0, w - 1); aw.rotateX(-Math.PI / 2); aw.rotateZ(-dir * .42); aw.translate(fx + dir * .95, 3.95, cz);
    const uv = aw.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * (w - 1) / 2, u); }
    awningGeos[key].geos.push(aw);
    // sign
    const [name, color, kind] = shop;
    const sm2 = kind === 'neon' ? new THREE.MeshBasicMaterial({ map: neonTex(name, color), transparent: true, depthWrite: false }) : new THREE.MeshStandardMaterial({ map: boardTex(name, color, '#ffffff', { border: '#ffffff' }), roughness: .6, emissive: '#ffffff', emissiveIntensity: 0 });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1.5, 7), Math.min(w - 1.5, 7) / 4), sm2); sg.position.set(fx + dir * .2, 5.1, cz); sg.rotation.y = dir * Math.PI / 2; scene.add(sg);
    if (kind === 'neon') { const back = mesh(boxGeo(.1, Math.min(w - 1.5, 7) / 4 + .2, Math.min(w - 1.5, 7) + .2, fx + dir * .1, 5.1, cz), std('#1b1030'), false); scene.add(back); addNeon(sm2, '#ffffff', rr(33, 36.5), 1.0); } else boardSigns.push(sm2);
    // neon trim along roof line on some
    if (R() < .5) { const nc = pick(['#ff2fd6', '#2ef2ff', '#ffe03a', '#7dff6a', '#b26bff']); const nm = new THREE.MeshBasicMaterial({ color: nc }); const g = merge([boxGeo(.12, .12, w - .4, fx + dir * .1, h - .3, cz)]); scene.add(mesh(g, nm, false, false)); addNeon(nm, nc, rr(33.5, 37), .5); }
    z += w;
  }
  // tall tower behind shops
  const bx = east ? (x0 + x1) / 2 + 6 : (x0 + x1) / 2 - 6; if (R() < .7) buildTower(bx, (z0 + z1) / 2, 12, (z1 - z0) * .7, rr(40, 90), R());
}
const shopWindows = [], boardSigns = [];
let sfTex = null;
function storefrontTex() {
  const W = 1024, H = 256, [c, g] = cnv(W, H), [ce, ge] = cnv(W, H); const r = mulberry(11);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x0 = i * 256; const door = i === 1;
    g.fillStyle = '#2a2a30'; g.fillRect(x0, 0, 256, H); // frame
    const gx = x0 + 14, gy = 14, gw = 228, gh = H - 28;
    const gr = g.createLinearGradient(0, gy, 0, gy + gh); gr.addColorStop(0, '#3b4f66'); gr.addColorStop(.5, '#1a2433'); gr.addColorStop(1, '#2b2018');
    g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    // interior warm light + shelves & silhouettes
    const ig = ge.createRadialGradient(x0 + 128, 60, 10, x0 + 128, 120, 220); ig.addColorStop(0, '#ffe2b0'); ig.addColorStop(1, '#6b3d1a');
    ge.fillStyle = ig; ge.fillRect(gx, gy, gw, gh);
    ge.fillStyle = '#000';
    for (let s = 0; s < 3; s++) { ge.globalAlpha = .55; ge.fillRect(gx + 10, 70 + s * 50, gw - 20, 6); for (let k = 0; k < 9; k++) { ge.fillStyle = ['#ff6b9a', '#39d7ff', '#ffd23f', '#9b6bff', '#6bff9b'][(k + s + i) % 5]; ge.globalAlpha = .8; ge.fillRect(gx + 16 + k * 23, 48 + s * 50, 14, 22); } ge.fillStyle = '#000'; }
    ge.globalAlpha = 1;
    if (door) { g.fillStyle = '#2a2a30'; g.fillRect(x0 + 90, 40, 8, H - 40); g.fillRect(x0 + 158, 40, 8, H - 40); ge.fillStyle = '#000'; ge.fillRect(x0 + 90, 40, 8, H - 40); ge.fillRect(x0 + 158, 40, 8, H - 40); g.fillStyle = '#c9c9c9'; g.fillRect(x0 + 112, 140, 4, 40); g.fillRect(x0 + 140, 140, 4, 40); }
    // reflection streak
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(gx + 40, gy); g.lineTo(gx + 90, gy); g.lineTo(gx + 20, gy + gh); g.lineTo(gx - 30 + 40, gy + gh); g.fill();
    g.fillStyle = '#2a2a30'; g.fillRect(x0, 0, 256, 34); ge.fillStyle = '#000'; ge.fillRect(x0, 0, 256, 34);
  }
  return [tex(c, { rep: true }), tex(ce, { rep: true })];
}
function storefrontMat(w) {
  if (!sfTex) sfTex = storefrontTex();
  const m = new THREE.MeshStandardMaterial({ map: sfTex[0].clone(), emissiveMap: sfTex[1].clone(), emissive: '#ffffff', emissiveIntensity: .6, roughness: .12, metalness: .2, envMapIntensity: 1.2 });
  for (const t of [m.map, m.emissiveMap]) { t.repeat.set(Math.max(1, Math.round(w / 3)) / 4, 1); t.offset.x = Math.floor(R() * 4) / 4; t.needsUpdate = true; }
  return m;
}

// ------------------------------------------------ beach boulevard hotels (art deco + neon)
const HOTELS = ['CORAL SANDS', 'STARLITE', 'PALM ROYALE', 'FLAMINGO BAY', 'SEA BREEZE', 'MOONGLOW', 'LUNA AZUL', 'SUNRAY', 'AQUA VISTA', 'CLUB NEBULA', 'THE MARLOWE', 'GOLDEN REEF', 'NEON BAY HOTEL', 'BAHIA', 'SOL Y MAR', 'THE ORCHID'];
const NEONC = ['#ff2fd6', '#2ef2ff', '#ffe03a', '#7dff6a', '#b26bff', '#ff7b2e', '#ff4f6d'];
const reflQuads = [];
function buildHotels() {
  let hi = 0; const reflT = (() => { const [c, g] = cnv(128, 256); const img = g.createImageData(128, 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) { const a = Math.pow(y / 256, 1.6) * Math.pow(Math.sin(Math.PI * x / 127), 1.5) * (.6 + .4 * Math.abs(Math.sin(x * .9) * Math.sin(x * .37 + y * .01))); const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255; } g.putImageData(img, 0, 0); return tex(c); })();
  for (let k = 0; k < STREETS_X.length - 1; k++) {
    const z0 = STREETS_X[k] + 5 + 1, z1 = STREETS_X[k + 1] - 5 - 1;
    if (Math.abs((z0 + z1) / 2 - HWY_Z) < 10) continue;
    let z = z0;
    while (z < z1 - 6) {
      const w = Math.min(rr(11, 15), z1 - z); const cz = z + w / 2; z += w + .6;
      const floors = ri(3, 6), h = 4.4 + floors * 3.3; const fx = 24.5; const depth = 16; const col = DECO[hi % DECO.length];
      const name = HOTELS[hi % HOTELS.length]; const nc = NEONC[hi % NEONC.length]; hi++;
      addBlock('deco', fx - depth / 2, 0, cz, depth, h, w - .4, col, -4.4 / 28 + .03);
      // deco eyebrows & fin
      const white = []; for (let f = 1; f <= floors; f++) white.push(boxGeo(.7, .14, w - .4, fx + .3, 4.4 + f * 3.3 - 3.3 + .1, cz));
      const finH = h + rr(3, 7); white.push(boxGeo(1.4, finH, .8, fx + .5, finH / 2, cz + (R() < .5 ? -w / 4 : w / 4)));
      white.push(boxGeo(1.2, .5, w + .2, fx + .2, h + .25, cz));
      scene.add(mesh(merge(white), std(R() < .5 ? '#ffffff' : pick(DECO)), true, true));
      // lobby glass
      const lob = mesh(boxGeo(.2, 3.4, w - 2, fx + .1, 1.9, cz), storefrontMat(w - 2), false); scene.add(lob); shopWindows.push(lob.material);
      // neon outline (roof edge + fin edges)
      const nm = new THREE.MeshBasicMaterial({ color: nc }); const ng = [boxGeo(.14, .14, w + .2, fx + .85, h + .55, cz), boxGeo(.14, .14, w - .4, fx + .7, 4.55, cz)];
      const finZ = white[white.length - 2].boundingBox ? 0 : 0;
      ng.push(boxGeo(.14, finH - 4, .14, fx + 1.25, (finH + 4) / 2, cz + w / 4 + .4)); ng.push(boxGeo(.14, finH - 4, .14, fx + 1.25, (finH + 4) / 2, cz - w / 4 - .4));
      const nmesh = mesh(merge(ng), nm, false, false); scene.add(nmesh); addNeon(nm, nc, rr(33.4, 37.5), .55);
      // name sign
      const sm2 = new THREE.MeshBasicMaterial({ map: neonTex(name, nc, { script: R() < .4 }), transparent: true, depthWrite: false });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 10), Math.min(w - 1, 10) / 4), sm2); sg.position.set(fx + .85, h - 1.4, cz); sg.rotation.y = Math.PI / 2; scene.add(sg); addNeon(sm2, '#ffffff', rr(33.4, 37.5), .9);
      // fake wet reflection on the boulevard
      const rq = new THREE.Mesh(new THREE.PlaneGeometry(16, w * .7).rotateX(-Math.PI / 2).translate(fx + 9, .06, cz), new THREE.MeshBasicMaterial({ map: reflT, color: nc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      rq.geometry.attributes.uv.array.forEach((v, i, a) => { }); // gradient runs across x via rotation below
      { const uv = rq.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); } }
      scene.add(rq); reflQuads.push(rq);
      // sidewalk cafe
      if (R() < .55) for (let u = 0; u < 2; u++) { const ux = 26.4, uz = cz + (u ? 2.5 : -2.5); umbrella(ux, uz, pick(['#ff4f8b', '#19c2c9', '#ffbe0b', '#ffffff', '#7b2ff7']), .15); }
      // club searchlights
      if (name === 'CLUB NEBULA') clubPos.push(V(fx - 4, h, cz));
    }
    // palms + lamps along boulevard sidewalks
    for (let zz = z0 + 4; zz < z1 - 2; zz += 12) { placePalm(27.0, zz + rr(-1, 1)); }
    for (let zz = z0 + 6; zz < z1; zz += 18) { lamps.push({ x: 28.4, z: zz + 4, rot: 0 }); if (Math.abs(zz - 2) > 14) lamps.push({ x: 42.4, z: zz - 2, rot: Math.PI }); }
  }
  onT(() => { const k = sm(.5, .95, G.night); for (const q of reflQuads) q.material.opacity = k * .3; });
}
const clubPos = [];
const umbGeos = {};
function umbrella(x, z, col, y0 = 0, r = 1.6) {
  if (!umbGeos[col]) umbGeos[col] = [];
  const top = new THREE.ConeGeometry(r, .55, 12, 1, true); top.translate(x, y0 + 2.45, z);
  umbGeos[col].push(top, new THREE.CylinderGeometry(.035, .035, 2.5, 6).translate(x, y0 + 1.25, z));
}
function buildBeach() {
  // lifeguard towers
  const cols = ['#ff70a6', '#ffd166', '#2ec4b6', '#b26bff', '#ff9f1c'];
  [-150, -60, 30, 110, 210, -260].forEach((z, i) => {
    const g = new THREE.Group(); const c = cols[i % cols.length]; const m = std(c, { roughness: .6 }), w = std('#ffffff');
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(.1, .1, 2.4, 6).translate(a * 1.1, 1.2, b * 1.1), w));
    g.add(mesh(new RoundedBoxGeometry(3, 2.1, 3, 3, .35).translate(0, 3.4, 0), m));
    g.add(mesh(boxGeo(3.4, .18, 3.4, 0, 2.38, 0), w));
    g.add(mesh(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4).translate(0, 5.05, 0), w));
    g.add(mesh(boxGeo(.08, 1.1, 2.4, 1.52, 3.5, 0), std('#0f2a3d', { roughness: .1, metalness: .5 }), false));
    g.add(mesh(boxGeo(3.4, .1, 1.2, -2.6, 1.2, 0).rotateZ(.45), w));
    g.position.set(60, .1, z); g.rotation.y = 0; scene.add(g);
  });
  // umbrellas + loungers + towels
  for (let i = 0; i < 70; i++) { const z = rr(-320, 320); if (Math.abs(z - 150) < 14) continue; const x = rr(53, 64); umbrella(x, z, pick(['#ff4f8b', '#19c2c9', '#ffbe0b', '#ffffff', '#7b2ff7', '#ff7b2e', '#06d6a0']), 0); }
  const towel = []; for (let i = 0; i < 60; i++) towel.push(colorize(boxGeo(1, .03, 1.9, rr(52, 66), .16, rr(-320, 320)).rotateY(0), pick(['#ff4f8b', '#2ef2ff', '#ffe03a', '#ffffff', '#b26bff'])));
  scene.add(mesh(merge(towel), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), false, true));
  for (const col in umbGeos) { const m = mesh(merge(umbGeos[col]), std(col, { roughness: .7, side: THREE.DoubleSide })); scene.add(m); }
  // promenade palms + lamps
  for (let z = -330; z < 330; z += 12) { if (z + 6 > -14 && z + 6 < 18) continue; placePalm(49, z + 6); }
  for (let z = -330; z < 330; z += 9) if (R() < .45 && Math.abs(z) > 14) placePalm(rr(55, 66), z + rr(-3, 3), 1.15);
}
// ------------------------------------------------ expressway + cable-stayed bridge + island + pier & wheel
function buildInfra() {
  const conc = std('#d9d4cb', { roughness: .8 });
  const deck = [], piers = [], barriers = [];
  const x0 = -300, x1 = 470;
  deck.push(boxGeo(x1 - x0, 1.2, 16, (x0 + x1) / 2, 8.4, HWY_Z));
  barriers.push(boxGeo(x1 - x0, .9, .35, (x0 + x1) / 2, 9.45, HWY_Z - 7.85), boxGeo(x1 - x0, .9, .35, (x0 + x1) / 2, 9.45, HWY_Z + 7.85), boxGeo(x1 - x0, .8, .3, (x0 + x1) / 2, 9.4, HWY_Z));
  for (let x = x0 + 10; x < x1; x += 26) { if (STREETS_Z.some(s => Math.abs(x - s) < 7) || (x > 26 && x < 52)) continue; piers.push(new THREE.CylinderGeometry(1.1, 1.3, 9, 12).translate(x, 3.6, HWY_Z - 4), new THREE.CylinderGeometry(1.1, 1.3, 9, 12).translate(x, 3.6, HWY_Z + 4), boxGeo(2.5, 1, 14, x, 7.6, HWY_Z)); }
  scene.add(mesh(merge(deck), conc), mesh(merge(piers), conc), mesh(merge(barriers), std('#f0ece4')));
  const hw = new THREE.PlaneGeometry(14, x1 - x0); hw.rotateX(-Math.PI / 2); hw.rotateY(Math.PI / 2); hw.translate((x0 + x1) / 2, 9.02, HWY_Z);
  const hm = roadMat.hwy.clone(); hm.map = roadMat.hwy.map.clone(); hm.map.repeat.set(1, (x1 - x0) / 10); hm.map.needsUpdate = true; scene.add(mesh(hw, hm, false, true));
  onT(() => { hm.roughness = roadMat.hwy.roughness; });
  // pylons + cables
  const py = [], cab = [];
  for (const px of [200, 320]) {
    for (const s of [-1, 1]) py.push(rodGeo(V(px, 0, HWY_Z + s * 11), V(px, 62, HWY_Z + s * 1.2), 1.1, 10));
    py.push(boxGeo(2.2, 3, 4, px, 50, HWY_Z), boxGeo(2.2, 2.5, 22, px, 6.5, HWY_Z));
    for (let i = 1; i <= 9; i++) for (const d of [-1, 1]) for (const s of [-1, 1]) cab.push(rodGeo(V(px, 58 - i * 2.2, HWY_Z + s * 2), V(px + d * i * 6.5, 9.4, HWY_Z + s * 7.6), .07, 4));
  }
  scene.add(mesh(merge(py), std('#f4f1ea', { roughness: .6 })), mesh(merge(cab), std('#ffffff', { roughness: .4 }), false));
  const cableLights = []; for (const px of [200, 320]) for (let i = 1; i <= 9; i++) for (const d of [-1, 1]) for (const s of [-1, 1]) cableLights.push(new THREE.SphereGeometry(.3, 6, 4).translate(px + d * i * 6.5, 9.9, HWY_Z + s * 7.6)); for (const px of [200, 320]) cableLights.push(new THREE.SphereGeometry(.7, 8, 6).translate(px, 63, HWY_Z));
  const clm = new THREE.MeshBasicMaterial({ color: 0xffffff }); scene.add(mesh(merge(cableLights), clm, false, false)); addNeon(clm, '#9ef3ff', 33.6, .25);
  for (let x = x0 + 5; x < x1; x += 30) lamps.push({ x, z: HWY_Z + 7.5, rot: -Math.PI / 2, y: 9 });
  // island "Palm Key"
  const isl = new THREE.CylinderGeometry(90, 110, 4, 48).translate(560, -1.6, HWY_Z + 20); scene.add(mesh(isl, std('#f0d59c', { roughness: .95 }), false, true));
  scene.add(mesh(new THREE.CylinderGeometry(75, 82, 1, 48).translate(560, .6, HWY_Z + 20), std('#6aa84f', { roughness: .95 }), false, true));
  for (let i = 0; i < 40; i++) { const a = R() * TAU, r = rr(20, 85); placePalm(560 + Math.cos(a) * r, HWY_Z + 20 + Math.sin(a) * r, 1.1); }
  for (let i = 0; i < 7; i++) buildTower(540 + rr(-40, 40), HWY_Z + 20 + rr(-50, 50), rr(14, 20), rr(14, 20), rr(25, 70), R());
  // lighthouse
  const lh = merge([new THREE.CylinderGeometry(2.2, 3.2, 26, 16).translate(630, 13, HWY_Z + 70)]); scene.add(mesh(lh, std('#ffffff')));
  for (let i = 0; i < 3; i++) scene.add(mesh(new THREE.CylinderGeometry(2.6 - i * .3, 2.75 - i * .3, 3, 16).translate(630, 4 + i * 7.5, HWY_Z + 70), std('#e63946')));
  const lamp = mesh(new THREE.SphereGeometry(1.6, 12, 8).translate(630, 27.5, HWY_Z + 70), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); scene.add(lamp); addNeon(lamp.material, '#fff1c0', 33, .6);
  // pier + Ferris wheel
  const pz = 150, pierG = [boxGeo(110, .6, 14, 50 + 55, 2.6, pz)];
  for (let x = 52; x < 160; x += 8) for (const s of [-1, 1]) pierG.push(new THREE.CylinderGeometry(.35, .35, 5, 6).translate(x, 0, pz + s * 6.4));
  pierG.push(boxGeo(110, 1, .2, 105, 3.4, pz - 6.9), boxGeo(110, 1, .2, 105, 3.4, pz + 6.9));
  scene.add(mesh(merge(pierG), std('#a98c6b', { roughness: .9 })));
  for (let x = 58; x < 160; x += 16) lamps.push({ x, z: pz + 6, rot: Math.PI / 2, y: 2.9 });
  const wheel = new THREE.Group(); wheel.position.set(118, 24, pz); scene.add(wheel);
  const wm = std('#ffffff', { metalness: .4, roughness: .35 });
  const ring = merge([new THREE.TorusGeometry(19, .35, 8, 72), new THREE.TorusGeometry(17.5, .2, 6, 72), ...Array.from({ length: 16 }, (_, i) => rodGeo(V(0, 0, 0), V(Math.cos(i / 16 * TAU) * 19, Math.sin(i / 16 * TAU) * 19, 0), .14, 4))]);
  const rot = new THREE.Group(); wheel.add(rot); for (const s of [-1.3, 1.3]) { const r = mesh(ring, wm); r.position.z = s; rot.add(r); }
  rot.add(mesh(new THREE.CylinderGeometry(1, 1, 3.4, 12).rotateX(Math.PI / 2), wm));
  const wn = new THREE.MeshBasicMaterial({ color: 0xffffff }); const ringL = mesh(new THREE.TorusGeometry(19.45, .16, 6, 96), wn, false, false); rot.add(ringL); const ringL2 = ringL.clone(); ringL2.position.z = 1.3; ringL.position.z = -1.3; rot.add(ringL2); addNeon(wn, '#ff2fd6', 33.8, .35);
  const spokeL = new THREE.MeshBasicMaterial({ color: 0xffffff }); rot.add(mesh(merge(Array.from({ length: 16 }, (_, i) => rodGeo(V(0, 0, 0), V(Math.cos(i / 16 * TAU + .1) * 18.8, Math.sin(i / 16 * TAU + .1) * 18.8, 0), .09, 4))), spokeL, false, false)); addNeon(spokeL, '#2ef2ff', 34.3, .2);
  const legs = merge([rodGeo(V(-9, -24, -4), V(0, 0, -2), .5, 8), rodGeo(V(9, -24, -4), V(0, 0, -2), .5, 8), rodGeo(V(-9, -24, 4), V(0, 0, 2), .5, 8), rodGeo(V(9, -24, 4), V(0, 0, 2), .5, 8)]);
  wheel.add(mesh(legs, wm));
  const cabins = []; const cabCols = ['#ff4f8b', '#19c2c9', '#ffbe0b', '#7b2ff7'];
  for (let i = 0; i < 16; i++) { const c = mesh(new RoundedBoxGeometry(2.2, 2.2, 2.2, 2, .4), std(cabCols[i % 4], { roughness: .5 })); wheel.add(c); cabins.push(c); }
  onT(t => { const a = t * .12; rot.rotation.z = a; cabins.forEach((c, i) => { const ang = a + i / 16 * TAU; c.position.set(Math.cos(ang) * 19, Math.sin(ang) * 19 - 1.6, 0); }); wn.color.setHSL((t * .08) % 1, 1, .5).multiplyScalar(wn.userData.k ?? 1); });
}
// ------------------------------------------------ boats, gulls
function buildBoats() {
  const boats = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); const L = rr(10, 22);
    const sh = new THREE.Shape(); sh.moveTo(-L / 2, 1.2); sh.lineTo(L / 2, 1.4); sh.lineTo(L / 2 - 1, .2); sh.quadraticCurveTo(0, -.6, -L / 2 + .5, .1); sh.lineTo(-L / 2, 1.2);
    const hull = new THREE.ExtrudeGeometry(sh, { depth: L * .28, bevelEnabled: true, bevelSize: .3, bevelThickness: .4, bevelSegments: 2 }); hull.translate(0, 0, -L * .14);
    g.add(mesh(hull, std('#ffffff', { roughness: .3 })));
    g.add(mesh(new RoundedBoxGeometry(L * .4, 1.4, L * .2, 2, .3).translate(-L * .05, 2, 0), std('#f4f4f4', { roughness: .3 })));
    g.add(mesh(boxGeo(L * .38, .4, L * .205, -L * .05, 2.1, 0), glassM));
    const lt = mesh(boxGeo(L * .3, .15, L * .21, -L * .05, 1.45, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); g.add(lt); addNeon(lt.material, pick(['#2ef2ff', '#ff2fd6', '#ffffff']), rr(34, 37), .1);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(L * 2.5, L * .5).rotateX(-Math.PI / 2).translate(-L * 1.7, .05, 0), additive(glowTex, 0xffffff, .5)); g.add(wake);
    scene.add(g); boats.push({ g, x: rr(150, 700), z0: rr(-400, 400), v: rr(2, 5) * (R() < .5 ? 1 : -1), bob: R() * 10 });
  }
  onT(t => { for (const b of boats) { const z = ((b.z0 + b.v * t + 600) % 1200 + 1200) % 1200 - 600; b.g.position.set(b.x, -.2 + Math.sin(t * 1.1 + b.bob) * .15, z); b.g.rotation.set(Math.sin(t * .9 + b.bob) * .03, b.v > 0 ? -Math.PI / 2 : Math.PI / 2, 0); } });
  // seagulls
  const gulls = []; const gm = std('#ffffff', { side: THREE.DoubleSide, roughness: .6 });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group(); g.add(mesh(new THREE.CapsuleGeometry(.08, .3, 4, 8).rotateX(Math.PI / 2), gm)); const wings = [];
    for (const s of [1, -1]) { const w = new THREE.Group(); const wg = new THREE.PlaneGeometry(.55, .16).translate(.28, 0, 0); w.add(mesh(wg, gm)); w.scale.x = s; g.add(w); wings.push(w); }
    scene.add(g); gulls.push({ g, wings, c: V(rr(40, 70), rr(9, 16), rr(-60, 60)), r: rr(6, 14), w: rr(.25, .45) * (R() < .5 ? -1 : 1), ph: R() * TAU });
  }
  onT(t => { for (const q of gulls) { const a = q.ph + t * q.w; q.g.position.set(q.c.x + Math.cos(a) * q.r, q.c.y + Math.sin(t * .7 + q.ph) * .8, q.c.z + Math.sin(a) * q.r); q.g.rotation.y = -a - (q.w > 0 ? 0 : Math.PI); const f = Math.sin(t * 9 + q.ph) * .6; q.wings[0].rotation.z = f; q.wings[1].rotation.z = f; } });
}

// ================================================================ SKY, LIGHTS, ENV
const SUN_DIR = V(.45, .16, .88).normalize();
const MOON_DIR = V(.55, .42, .7).normalize();
let sky, sun, hemi, skyScene, pmrem, envCache = new Map();
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR }, uMoon: { value: MOON_DIR }, uNight: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uSun, uMoon; uniform float uNight, uTime; varying vec3 vDir;
      float h3(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 dz = vec3(.22,.24,.55), dm = vec3(.98,.47,.58), dh = vec3(1.,.72,.42);
        vec3 nz = vec3(.012,.02,.07), nm = vec3(.08,.05,.2), nh = vec3(.34,.12,.42);
        vec3 z = mix(dz,nz,uNight), m = mix(dm,nm,uNight), hz = mix(dh,nh,uNight);
        float sd = max(dot(d, uSun), 0.);
        hz = mix(hz, mix(vec3(1.,.82,.55), nh, uNight), pow(sd,3.)*.8);
        float hh = max(h,0.);
        vec3 col = mix(hz, m, smoothstep(0., .14, hh));
        col = mix(col, z, smoothstep(.1, .62, hh));
        if (h < 0.) col = mix(hz, hz*.55, smoothstep(0., -.25, h));
        col = lin(col);
        // clouds
        vec2 cp = d.xz / (h + .12) * 1.3 + vec2(uTime*.004, 0.);
        float cl = smoothstep(.52, .8, fbm(cp*1.4)) * smoothstep(0., .12, h) * (1. - smoothstep(.45,.8,h));
        vec3 cc = mix(lin(vec3(1.,.62,.62)) * (.7 + .8*pow(sd,4.)), lin(vec3(.16,.09,.28)), uNight);
        col = mix(col, cc, cl*.75);
        float day = 1. - uNight;
        col += lin(vec3(1.,.72,.42)) * (pow(sd, 10.)*.7 + pow(sd, 90.)*1.2) * day;
        col += vec3(12.,9.,6.) * smoothstep(.99955, .9998, sd) * day;
        // stars
        vec3 sp = floor(d*420.); float st = step(.9978, h3(sp)) * smoothstep(.04, .35, h);
        col += vec3(1.5) * st * uNight * (.6 + .4*sin(uTime*2.5 + h3(sp+3.)*30.));
        // moon
        float md = dot(d, uMoon); col += vec3(3.2,3.1,2.8) * smoothstep(.99955,.9997,md) * uNight; col += lin(vec3(.45,.4,.7)) * pow(max(md,0.), 30.) * .35 * uNight;
        gl_FragColor = vec4(col, 1.);
      }`
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat); sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  skyScene = new THREE.Scene(); const sk2 = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat); skyScene.add(sk2);
  pmrem = new THREE.PMREMGenerator(renderer);
  sun = new THREE.DirectionalLight(0xffc48a, 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  scene.add(sun, sun.target);
  hemi = new THREE.HemisphereLight(0x9fb4ff, 0xc08060, 1.1); scene.add(hemi);
  scene.fog = new THREE.Fog(0xffb98a, 300, 2600);
}
function envFor(n) { const q = Math.round(n * 10) / 10; if (!envCache.has(q)) { sky.material.uniforms.uNight.value = q; envCache.set(q, pmrem.fromScene(skyScene, 0, .1, 200).texture); } return envCache.get(q); }
function updateSky(t, focus, ext) {
  const n = G.night; const u = sky.material.uniforms; u.uNight.value = n; u.uTime.value = t;
  scene.environment = envFor(n); u.uNight.value = n;
  sun.color.set(0xffc48a).lerp(new THREE.Color(0x7d8cff), n); sun.intensity = lerp(3.3, .45, n);
  const dir = SUN_DIR.clone().lerp(MOON_DIR, n).normalize();
  sun.position.copy(focus).addScaledVector(dir, 400); sun.target.position.copy(focus);
  const c = sun.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 50; c.far = 900; c.updateProjectionMatrix();
  hemi.intensity = lerp(1.05, .55, n); hemi.color.set(0x9fb4ff).lerp(new THREE.Color(0x5a4aa8), n); hemi.groundColor.set(0xc08060).lerp(new THREE.Color(0x2a1838), n);
  scene.fog.color.set(0xf0a07a).lerp(new THREE.Color(0x1c0f33), n); scene.fog.near = lerp(250, 200, n); scene.fog.far = lerp(2600, 2200, n);
  sky.position.copy(camera.position);
}

// ================================================================ CAST & TRAFFIC
let benny, cyclist, bike, heroCar;
const peds = [];
function buildCast() {
  benny = makeCharacter({ skin: '#f2c094', shirtTex: hawaiianTex('#17a9a0', '#ff4f8b', '#0b6b5e'), pants: '#e0c08a', shorts: true, hair: '#3b2414', hairStyle: 'quiff', chub: 1.22, shoes: '#ffffff', phone: true, shades: 'head', shadeFrame: '#ff2fd6', iris: '#3a2414' });
  benny.shirtM.userData.base = benny.shirtM.color.clone(); scene.add(benny.root);
  // cyclist
  bike = makeBike('#ffbe0b'); scene.add(bike.g);
  cyclist = makeCharacter({ skin: '#8d5524', shirt: '#2ef2ff', pants: '#22223b', shorts: true, hairStyle: 'helmet', capColor: '#ff2f7a', shades: 'eyes', full: false, chub: .95, shoes: '#ff2f7a' });
  bike.g.add(cyclist.root); cyclist.root.position.set(-.18, .02, 0); cyclist.root.rotation.y = Math.PI / 2;
  // pedestrians
  const pedR = mulberry(77); const old = R; R = pedR;
  const mk = () => makeCharacter({ skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), shorts: R() < .45, hair: pick(HAIRS), hairStyle: pick(['short', 'short', 'long', 'bun', 'bald', 'cap', 'long']), capColor: pick(SHIRTS), chub: rr(.9, 1.15), height: rr(.92, 1.08), full: false, shades: R() < .35 ? 'eyes' : null, dress: R() < .15, shoes: pick(['#ffffff', '#222222', '#ff4f8b', '#2ef2ff']) });
  // shopping street sidewalks
  for (let i = 0; i < 26; i++) { const east = i % 2 === 0; const c = mk(); scene.add(c.root); peds.push({ c, x: east ? (i % 4 === 0 ? -34.3 : -32.6) : (i % 4 === 1 ? -45.8 : -47.6), dir: R() < .5 ? 1 : -1, v: rr(1.0, 1.5), z0: rr(-60, 60), lo: east ? -2 : -60, hi: 60, ph: R() * TAU }); }
  // promenade + hotel sidewalk
  for (let i = 0; i < 26; i++) { const c = mk(); scene.add(c.root); const prom = i % 2 === 0; peds.push({ c, x: prom ? rr(46.8, 48.6) : rr(25.5, 26.6), dir: R() < .5 ? 1 : -1, v: rr(.9, 1.4), z0: rr(-120, 220), lo: prom ? 24 : -120, hi: 220, ph: R() * TAU }); }
  // seated cafe guests
  for (let i = 0; i < 4; i++) { const c = mk(); scene.add(c.root); const z = 10 + i * 2.2; c.root.position.set(-33.6 + (i % 2) * .9, .1, z); c.root.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2; seated.push({ c, ph: R() * 6 }); }
  R = old;
  // cafe tables
  for (let i = 0; i < 4; i++) { umbrella(-33.1, 10 + i * 2.2, pick(['#ff4f8b', '#19c2c9', '#ffbe0b']), .15, 1.1); }
}
const seated = [];
const traffic = [];
function buildTraffic() {
  const tr = mulberry(4242); const old = R; R = tr;
  const types = ['sedan', 'sedan', 'suv', 'taxi', 'sports', 'suv', 'sedan'];
  const loop = (axis, lane, dir, v, n, lo, hi, opts = {}) => { const L = hi - lo; for (let i = 0; i < n; i++) { const ty = opts.type || pick(types); const car = makeCar(ty, ty === 'taxi' ? '#ffc21a' : pick(PAINTS), opts); traffic.push({ car, kind: 'loop', axis, lane, dir, v, lo, L, off: (i + rr(-.25, .25)) / n * L }); } };
  // boulevard (x along z). +z lanes 30.75, 33.25 ; -z lanes 35.75 (38.25 = hero lane)
  loop('z', 30.75, 1, 13, 14, -340, 340); loop('z', 33.25, 1, 15.5, 10, -340, 340); loop('z', 35.75, -1, 11, 4, -340, -40);
  // other city streets
  for (const x of [0, -80, -120, -160]) { loop('z', x - 1.25, 1, 12, 5, -320, 320); loop('z', x + 1.25, -1, 12, 5, -320, 320); }
  for (const z of [20, -60, 100]) { loop('x', z + 1.25, 1, 11, 4, -260, 25); loop('x', z - 1.25, -1, 11, 4, -260, 25); }
  // expressway (+x lanes at z>-200)
  for (const [z, d, v] of [[HWY_Z + 1.75, 1, 27], [HWY_Z + 5.25, 1, 23], [HWY_Z - 1.75, -1, 26], [HWY_Z - 5.25, -1, 22]]) loop('x', z, d, v, 11, -300, 470, { lod: true, y: 9 });
  // parked cars: shopping street and boulevard parking lane
  const park = (x, z, yaw) => { const ty = pick(['sedan', 'suv', 'sports', 'sedan']); const c = makeCar(ty, pick(PAINTS)); c.place(x, z, yaw, 0); traffic.push({ car: c, kind: 'static' }); };
  for (let z = -62; z < 62; z += rr(5.6, 7.5)) { if (Math.abs(z) < 7 || Math.abs(z - 20) < 7 || Math.abs(z + 20) < 7 || Math.abs(z - 60) < 6) continue; if (R() < .8) park(-43.75, z, HEAD.pz); if (R() < .8) park(-36.25, z + 2, HEAD.nz); }
  for (let z = -320; z < 320; z += rr(6, 9)) { if (z > -14 && z < 230) continue; if (STREETS_X.some(s => Math.abs(z - s) < 7)) continue; if (R() < .6) park(40.75, z, HEAD.nz); }
  R = old;
  // ---- scripted scene-2 traffic on the shopping street (x=-40): lane -38.75 heads -z, lane -41.25 heads +z
  const S2 = [
    { type: 'taxi', col: '#ffc21a', lane: -38.75, dir: -1, f: stopper(11, -3.4, 11.55, 1.05, 13.6) , honk: 1 },
    { type: 'suv', col: '#2a6df4', lane: -38.75, dir: -1, f: stopper(11, -10.8, 11.95, 1.1, 14.2) },
    { type: 'sedan', col: '#f8f8f8', lane: -38.75, dir: -1, f: t => -60 + 12 * (t - 6.0) }, // passes before Benny
    { type: 'sports', col: '#a3ff3a', lane: -41.25, dir: 1, f: stopper(12, -3.5, 13.05, 1.0, 14.75), honk: 2 },
    { type: 'sedan', col: '#ff4f9a', lane: -41.25, dir: 1, f: stopper(12, -10.8, 13.45, 1.1, 15.3) },
    { type: 'suv', col: '#121212', lane: -41.25, dir: 1, f: t => -95 + 12 * (t - 2.5) },
  ];
  for (const s of S2) { const car = makeCar(s.type, s.col); traffic.push({ car, kind: 'script', ...s }); }
  // motorcycle in scene 2
  const moto = makeMoto('#ff2f5a'); scene.add(moto.g); const rider = makeCharacter({ skin: '#c68642', shirt: '#121212', pants: '#22223b', hairStyle: 'helmet', capColor: '#111111', full: false, longSleeve: true }); moto.g.add(rider.root); rider.root.position.set(-.25, -.12, 0); rider.root.rotation.y = Math.PI / 2;
  traffic.push({ kind: 'moto', moto, rider });
  // hero car
  heroCar = makeCar('sports', '#e8177d');
  heroCar.f = stopper(26, 0, 25.0, 2.5);
}
function heroState(t) {
  const p = heroCar.f(t); const z = -p; const x = lerp(38.25, 40.75, smr(22.9, 24.7, t));
  return { x, z, p };
}
function updateTraffic(t) {
  const night = G.night;
  const tt = t + sm(32, 37, t) * 0 ; // (no time warp)
  for (const v of traffic) {
    if (v.kind === 'static') continue;
    if (v.kind === 'loop') {
      const s = ((v.off + v.v * tt) % v.L + v.L) % v.L; const pos = v.dir > 0 ? v.lo + s : v.lo + v.L - s;
      if (v.axis === 'z') v.car.place(v.lane, pos, v.dir > 0 ? HEAD.pz : HEAD.nz, v.v * tt);
      else { v.car.place(pos, v.lane, v.dir > 0 ? HEAD.px : HEAD.nx, v.v * tt); }
      if (v.car.grp.position.y === 0 && v.lane < -190 && v.lane > -210 && v.axis === 'x') v.car.grp.position.y = 9.05;
    } else if (v.kind === 'script') {
      const p = v.f(t); v.car.place(v.lane, v.dir * p, v.dir > 0 ? HEAD.pz : HEAD.nz, Math.abs(p), pitchFrom(v.f, t));
    } else if (v.kind === 'moto') {
      const z = 70 - 15 * (t - 4.2); v.moto.g.position.set(-38.4, 0, z); v.moto.g.rotation.y = HEAD.nz; for (const w of v.moto.wheels) w.rotation.z = (z) / .33;
      riderPose(v.rider, 0, .35); v.rider.LL.hp.rotation.x = -1.2; v.rider.RL.hp.rotation.x = -1.2; v.rider.LL.kn.rotation.x = 1.4; v.rider.RL.kn.rotation.x = 1.4;
    }
  }
  // hero
  const h = heroState(t); const h2 = heroState(t + .05);
  const dx = h2.x - h.x, dz = h2.z - h.z; const yaw = (Math.abs(dz) > 1e-4) ? Math.atan2(-dz, dx) : HEAD.nz; // forward vec (cos,−sin)
  const yawUse = (Math.abs(dz) > .004) ? yaw : HEAD.nz;
  heroCar.place(h.x, h.z, lerp(HEAD.nz, yawUse, 1), h.p, pitchFrom(heroCar.f, t), -(dx / Math.max(.01, -dz)) * .3 * 0);
  heroCar.steer(clamp((yawUse - HEAD.nz) * 4, -.4, .4));
  // lights
  const k = sm(.3, .8, night);
  lightMats.head.color.setRGB(lerp(1.4, 6, k), lerp(1.4, 5.8, k), lerp(1.3, 5, k));
  lightMats.tail.color.setRGB(lerp(1.1, 5, k), lerp(.05, .2, k), lerp(.1, .4, k));
  beamM.opacity = k * .35;
  for (const m of taxiSigns) m.color.setScalar(lerp(1, 2.6, k));
}

// ================================================================ BENNY'S PERFORMANCE
const P = { // pose library
  phone: { rSh: [-.55, 0, -.12], rEl: [-1.35, 0, 0], lSh: [-.5, 0, -.18], lEl: [-1.25, 0, 0], head: [.42, 0, 0], smile: .7, lid: .1, look: [0, .15], phoneRot: [-.35, 0, 0], eye: 1 },
  wow: { lSh: [-.4, 0, .55], rSh: [-.55, 0, -.45], lEl: [-.9, 0, 0], rEl: [-1.0, 0, 0], head: [-.1, 0, 0], eye: 1.35, pupil: .9, lid: -.6, browY: .03, smile: .5, open: .55, hipY: .02 },
  selfie1: { rSh: [-2.35, -.2, -.45], rEl: [-.35, 0, 0], lSh: [-.25, 0, .95], lEl: [-2.1, .3, 0], head: [-.12, .25, .18], torso: [-.04, .2, .06], pucker: 1, smile: 0, lid: .2, browA: .15, look: [.25, .25], peace: 1, phoneRot: [.2, 2.9, .1], eye: 1 },
  selfie2: { rSh: [-2.3, -.3, -.4], rEl: [-.3, 0, 0], lSh: [0, 0, 1.45], lEl: [0, 0, 1.75], head: [-.1, .3, -.12], torso: [-.05, .25, -.06], smile: 1.1, open: .25, eye: 1.08, lid: -.35, browY: .03, look: [.25, .2], phoneRot: [.2, 2.9, .1] },
  shock: { rSh: [-.6, 0, -1.25], rEl: [-.5, 0, 0], lSh: [-.6, 0, 1.25], lEl: [-.5, 0, 0], head: [-.12, 0, 0], torso: [-.12, 0, 0], eye: 1.65, pupil: .55, lid: -.8, browY: .06, open: 1, smile: 0, lHip: -.25, rHip: .2, lKnee: .5, rKnee: .3, phoneRot: [0, 0, 0] },
  wet: { rSh: [-.12, 0, -.18], rEl: [-.3, 0, 0], lSh: [.05, 0, .22], lEl: [-.15, 0, 0], head: [.08, 0, 0], torso: [.12, 0, 0], eye: 1, lid: .62, browA: -.25, browY: -.015, smile: -.55, open: 0, hipY: -.025, look: [0, 0] },
  complain: { rSh: [-.7, 0, -.7], rEl: [-1.2, 0, 0], lSh: [-.7, 0, .7], lEl: [-1.2, 0, 0], head: [-.38, 0, .1], torso: [-.06, 0, 0], eye: 1.1, lid: .1, browA: .35, browY: .02, smile: -.3, open: .6, hipY: 0 },
  stare: { rSh: [-.08, 0, -.15], rEl: [-.25, 0, 0], lSh: [.0, 0, .18], lEl: [-.2, 0, 0], head: [.05, 0, 0], torso: [.1, 0, 0], eye: 1, lid: .72, browA: -.3, smile: -.45, open: 0, look: [0, 0] },
};
function updateBenny(t) {
  const c = benny; let p; let x, z, yaw, walk = 0, phase = 0;
  if (t < 20) { // scene 2 — downtown, texting while crossing
    const pts = [[8, -32.6, 7.0], [9.3, -33.9, 1.5], [9.9, -35.0, .4], [15.6, -45.4, .25], [17, -47.6, -.7]];
    let i = 0; while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
    const [t0, x0, z0] = pts[i], [t1, x1, z1] = pts[i + 1]; const u = clamp((t - t0) / (t1 - t0));
    x = lerp(x0, x1, u); z = lerp(z0, z1, u);
    const ux = x1 - x0, uz = z1 - z0; const yawSeg = Math.atan2(ux, uz);
    yaw = yawSeg; if (i === 1) yaw = lerp(Math.atan2(pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]), yawSeg, sm(0, 1, u));
    if (i >= 2) yaw = lerp(Math.atan2(pts[2][1] - pts[1][1], pts[2][2] - pts[1][2]), Math.atan2(pts[3][1] - pts[2][1], pts[3][2] - pts[2][2]), sm(0, .12, u));
    walk = 1; phase = (t - 8) * 1.55 * TAU * .55; p = { ...BASE_POSE, ...P.phone };
    // flinch-free: he never notices the honks — only a tiny chuckle at his phone
    p.smile = .7 + .3 * Math.sin(t * 2.3); if (t > 12.5 && t < 13.5) { p.open = .3 * win(t, 12.5, 13.5); }
    c.root.position.set(x, .15 * (x > -35 || x < -45 ? 1 : 0) + (x <= -35 && x >= -45 ? .0 : 0), z);
  } else { // scene 4 — beach promenade
    const tA = 25.15, tB = 26.05; const A = [47.0, 2.2], B = [46.2, .15];
    const u = smr(tA, tB, t); x = lerp(A[0], B[0], u); z = lerp(A[1], B[1], u);
    const yWalk = Math.atan2(B[0] - A[0], B[1] - A[1]);
    yaw = t < tA ? lerp(-2.4, yWalk, sm(24.8, tA, t)) : lerp(yWalk, Math.PI / 2 + .12, sm(tB - .35, tB + .15, t));
    walk = win(t, tA - .05, tB + .05, .15, .2); phase = (t - tA) * 2.2 * TAU;
    p = poseSeq(t, [[0, P.phone], [24.75, P.wow, .25], [25.2, { ...P.wow, eye: 1.15, open: .2, smile: 1 }, .3], [26.15, P.selfie1, .25], [26.9, P.selfie2, .22], [27.62, { ...P.selfie2, smile: .6 }, .1], [27.78, P.shock, .12], [28.95, P.wet, .5], [29.55, P.complain, .35], [31.05, P.stare, .45]]);
    if (t > 29.6 && t < 31.0) p.open = .25 + .45 * Math.abs(Math.sin((t - 29.6) * 9)); // talking
    if (t > 27.8 && t < 28.5) p.hipY += Math.sin(clamp((t - 27.8) / .45) * Math.PI) * .16; // jump
    if (t > 31.45 && t < 31.65) p.lid = lerp(p.lid, 1.55, Math.sin((t - 31.45) / .2 * Math.PI)); // slow blink
    c.root.position.set(x, .15, z);
  }
  if (walk > 0) walkAdd(p, phase, walk, .25);
  c.root.rotation.y = yaw;
  c.pose(p);
  // wetness
  const wet = sm(27.72, 27.95, t) * (t > 20 ? 1 : 0);
  c.shirtM.color.copy(c.shirtM.userData.base).multiplyScalar(lerp(1, .6, wet)); c.shirtM.roughness = lerp(.8, .25, wet);
  c.skinM.roughness = lerp(.55, .2, wet); c.hairM.roughness = lerp(.55, .15, wet);
  c.quiff.scale.set(1, lerp(1, .35, wet), lerp(1, .8, wet)); c.quiff.position.set(0, lerp(0, -.05, wet), lerp(0, .03, wet));
  // phone flash
  const fl = Math.max(win(t, 26.42, 26.55, .02, .1), win(t, 27.15, 27.28, .02, .1));
  c.phone.userData.flash.material.color.setScalar(1 + fl * 60);
  c.phone.children[1].material.color.setRGB(1.3 + fl * 4, 1.6 + fl * 4, 2 + fl * 4);
}
function updatePeds(t) {
  const bx = benny.root.position;
  for (const q of peds) {
    const L = q.hi - q.lo; const s = ((q.z0 - q.lo + q.dir * q.v * t) % L + L) % L; const z = q.lo + s;
    let x = q.x;
    if (q.avoid) { const dz = z - 0; if (Math.abs(dz) < 4 && x > 45 && t > 23 && t < 33) x = 48.9; } // keep scene-4 set clear
    q.c.root.position.set(x, .15, z); q.c.root.rotation.y = q.dir > 0 ? 0 : Math.PI;
    const p = { ...BASE_POSE, smile: .5 + .2 * Math.sin(q.ph + t) }; walkAdd(p, q.ph + s / q.v * q.v * 3.6, 1, 1);
    p.head = [0, Math.sin(t * .6 + q.ph) * .3, 0]; q.c.pose(p);
  }
  for (const q of seated) { const p = { ...BASE_POSE, lHip: -1.45, rHip: -1.45, lKnee: 1.45, rKnee: 1.45, hipY: -.32, smile: .8, open: Math.max(0, Math.sin(t * 5 + q.ph)) * .35, head: [0, Math.sin(t * .8 + q.ph) * .35, 0], rSh: [-.6, 0, -.1], rEl: [-1.0, 0, 0] }; q.c.pose(p); }
}
function updateCyclist(t) {
  const z = -27 + 9 * (t - 24.6); bike.g.position.set(44.2, .15, z); bike.g.rotation.y = HEAD.pz;
  const a = z / .33; for (const w of bike.wheels) w.rotation.z = -a; bike.crank.rotation.z = -a * .45;
  riderPose(cyclist, a * .45, .5);
  cyclist.R.sh.rotation.z = -.05;
  if (t > 27.0 && t < 27.4) cyclist.L.sh.rotation.set(-1.5, 0, .2); // ring bell
  bike.g.visible = t > 23 && t < 31;
}

// ------------------------------------------------ splash particles (analytic ballistic)
let drops, drips, crown;
function buildSplash() {
  const n = 420; const wm = new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: .02, metalness: 0, transmission: 0, transparent: true, opacity: .6, envMapIntensity: 2.2, clearcoat: 1 });
  drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), wm, n); drops.frustumCulled = false; scene.add(drops);
  const r = mulberry(31337); drops.userData.p = [];
  for (let i = 0; i < n; i++) {
    const hit = r() < .72; const t0 = 27.6 + r() * .14; const T = .16 + r() * .22;
    const s = PUDDLE.clone().add(V((r() - .5) * .8, .02, (r() - .5) * 1.2));
    const tgt = hit ? V(46.2 + (r() - .5) * .5, .55 + r() * 1.35, .15 + (r() - .5) * .75) : V(44.8 + r() * 4.5, .15, (r() - .5) * 5);
    const g = -9.8; const v = V((tgt.x - s.x) / T, (tgt.y - s.y - .5 * g * T * T) / T, (tgt.z - s.z) / T);
    drops.userData.p.push({ s, v, t0, T, hit, size: .014 + r() * .032, tgt });
  }
  drips = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), wm, 70); drips.frustumCulled = false; scene.add(drips);
  drips.userData.p = Array.from({ length: 70 }, () => ({ off: V((r() - .5) * .55, .45 + r() * 1.1, (r() - .5) * .45), ph: r(), per: .45 + r() * .5 }));
  crown = new THREE.Mesh(new THREE.CylinderGeometry(1, .6, 1, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#d8f3ff', transparent: true, opacity: 0, roughness: .05, side: THREE.DoubleSide, depthWrite: false }));
  crown.position.copy(PUDDLE); scene.add(crown);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(), _p = V();
function updateSplash(t) {
  const P0 = drops.userData.p; let i = 0;
  for (const d of P0) {
    const dt = t - d.t0; let vis = dt > 0 && dt < 1.6;
    if (vis) {
      let pos, vel;
      if (dt < d.T) { pos = d.s.clone().addScaledVector(d.v, dt); pos.y += -4.9 * dt * dt; vel = d.v.clone(); vel.y += -9.8 * dt; }
      else { const e = dt - d.T; if (d.hit) { pos = d.tgt.clone(); pos.y = Math.max(.16, d.tgt.y - 4.9 * Math.max(0, e - .15) ** 2 - e * .3); pos.x += .08 * Math.min(e * 4, 1); vel = V(0, -1, 0); if (pos.y <= .16) vis = false; } else { vis = false; } }
      if (vis) { const sp = vel.length(); _q.setFromUnitVectors(V(0, 1, 0), vel.normalize()); const sz = d.size * (dt < d.T ? 1 : .7); _s.set(sz, sz * (1 + Math.min(sp, 12) * .12), sz); _m.compose(pos, _q, _s); }
    }
    if (!vis) _m.makeScale(0, 0, 0);
    drops.setMatrixAt(i++, _m);
  }
  drops.instanceMatrix.needsUpdate = true;
  const ck = t - 27.6; crown.visible = ck > 0 && ck < .6; if (crown.visible) { const s = .3 + ck * 2.2; crown.scale.set(s, .6 * Math.sin(clamp(ck / .6) * Math.PI) + .01, s); crown.position.y = PUDDLE.y + crown.scale.y / 2; crown.material.opacity = .35 * (1 - ck / .6); }
  // drips from Benny
  const on = t > 28.2 && t < 33; const bp = benny.root.position; i = 0;
  for (const d of drips.userData.p) {
    if (on) { const ph = ((t + d.ph * 10) % d.per) / d.per; const fall = ph * d.per; const y = d.off.y - 4.9 * fall * fall; const yy = Math.max(.16, y); _p.set(bp.x + d.off.x, yy + bp.y - .15, bp.z + d.off.z); const sz = .018 * (y < .16 ? 0 : 1); _m.compose(_p, _q.identity(), _s.set(sz, sz * 1.8, sz)); }
    else _m.makeScale(0, 0, 0);
    drips.setMatrixAt(i++, _m);
  }
  drips.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------ neon flicker + misc night stuff
function updateNeon(t) {
  const n = G.night;
  for (const s of neonList) {
    const on = t >= s.t0 ? 1 : 0; let k = on;
    if (t >= s.t0 && t < s.t0 + .6) { const f = Math.sin((t - s.t0) * 90 + s.seed) * Math.sin((t - s.t0) * 37 + s.seed * 2); k = f > -.1 ? 1 : .15; }
    const nightK = n > .2 ? k : 0;
    const intensity = lerp(s.dayK, 3.0, nightK * sm(.2, .9, n));
    s.mat.color.copy(s.col).multiplyScalar(intensity); s.mat.userData.k = intensity;
  }
  for (const m of shopWindows) m.emissiveIntensity = lerp(.55, 1.4, sm(.2, .8, n));
  for (const m of boardSigns) m.emissiveIntensity = lerp(0, .7, n);
}
let searchBeams = [];
function buildSearchlights() {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { opacity: { value: 0 }, color: { value: new THREE.Color(0xb9a6ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vY = uv.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float opacity; uniform vec3 color; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 3.); float a = f * pow(1. - vY, 1.4) * opacity; gl_FragColor = vec4(color * a, 1.); }` });
  const geo = new THREE.CylinderGeometry(16, .6, 260, 24, 1, true); geo.translate(0, 130, 0);
  for (const p of clubPos.length ? clubPos : [V(15, 20, 60)]) for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(geo, m); b.position.copy(p); scene.add(b); searchBeams.push({ b, i }); }
  onT(t => { m.uniforms.opacity.value = sm(.65, 1, G.night) * .35; for (const s of searchBeams) { const a = t * .6 + s.i * 2.2; s.b.rotation.set(Math.sin(a) * .45, 0, Math.cos(a * .8) * .5 - (s.i ? .2 : -.2)); } });
}
let beacons;
function buildRoofs() {
  scene.add(mesh(merge(roofGeos), std('#9a9a9e', { roughness: .8 })));
  if (spireGeos.length) scene.add(mesh(merge(spireGeos), std('#d0d4da', { metalness: .7, roughness: .3 })));
  if (beaconGeos.length) { beacons = mesh(merge(beaconGeos), lightMats.red, false, false); scene.add(beacons); }
  onT(t => { const b = (Math.sin(t * 3) > .3 ? 1 : .15); lightMats.red.color.setRGB(lerp(.8, 6, G.night) * b, .05, .05); });
  for (const k in winStyles) { const w = winStyles[k]; if (!w.geos.length) continue; const m = mesh(merge(w.geos), w.mat); scene.add(m); }
  for (const k in awningGeos) scene.add(mesh(merge(awningGeos[k].geos), awningGeos[k].mat));
}
function buildStreetProps() {
  for (const x of STREETS_Z) for (let z = -300; z < 300; z += 26) { if (STREETS_X.some(s => Math.abs(z - s) < 6)) continue; if (!(x === -40 && z > -50 && z < 6)) lamps.push({ x: x + 5.6, z, rot: Math.PI }); lamps.push({ x: x - 5.6, z: z + 13, rot: 0 }); }
  for (const x of [-40]) for (let z = -64; z < 64; z += 13) { if (STREETS_X.some(s => Math.abs(z - s) < 7) || Math.abs(z) < 4) continue; if (z + 3 > 8) placePalm(x + 5.9, z + 3, .8); placePalm(x - 5.9, z - 3, .8); }
  // traffic lights at the shopping street intersections
  const tg = [], tlights = { r: [], g: [] };
  for (const z of [20, -20, 60, -60]) for (const s of [1, -1]) { const x = -40 + s * 5.4, zz = z - s * 5.4; tg.push(new THREE.CylinderGeometry(.09, .11, 5.5, 8).translate(x, 2.75, zz), rodGeo(V(x, 5.3, zz), V(x - s * 3.5, 5.3, zz), .07, 6), boxGeo(.4, 1.1, .4, x - s * 3.5, 4.7, zz)); tlights.r.push(new THREE.SphereGeometry(.12, 8, 6).translate(x - s * 3.5, 5.05, zz - s * .21)); tlights.g.push(new THREE.SphereGeometry(.12, 8, 6).translate(x - s * 3.5, 4.4, zz - s * .21)); }
  scene.add(mesh(merge(tg), std('#26282e', { metalness: .5, roughness: .5 })));
  scene.add(mesh(merge(tlights.r), lightMats.red, false, false)); scene.add(mesh(merge(tlights.g), new THREE.MeshBasicMaterial({ color: new THREE.Color(.2, 3, 1.2) }), false, false));
  // hydrants, benches, bins along shopping street
  const hyd = [], bench = [], bin = [];
  for (let z = -60; z < 60; z += 17) { if (z + 4 > -40 && z + 4 < 0) continue; hyd.push(new THREE.CylinderGeometry(.14, .16, .65, 10).translate(-34.6, .47, z + 4)); bin.push(new THREE.CylinderGeometry(.28, .25, .9, 10).translate(-45.5, .6, z - 2)); bench.push(boxGeo(.5, .08, 1.8, -47.9, .6, z + 8), boxGeo(.08, .5, 1.8, -48.15, .85, z + 8)); }
  scene.add(mesh(merge(hyd), std('#e63946', { roughness: .4 })), mesh(merge(bin), std('#2a9d8f', { roughness: .6 })), mesh(merge(bench), std('#8b5e3c', { roughness: .8 })));
  // promenade benches
  const pb = []; for (let z = -300; z < 300; z += 24) { if (Math.abs(z) < 8) continue; pb.push(boxGeo(.5, .08, 2, 48.6, .6, z), boxGeo(.08, .5, 2, 48.9, .85, z)); }
  scene.add(mesh(merge(pb), std('#ffffff', { roughness: .6 })));
}

// ================================================================ CAMERA DIRECTOR
function cr(p0, p1, p2, p3, u) { const u2 = u * u, u3 = u2 * u; return p1.clone().multiplyScalar(2).add(p2.clone().sub(p0).multiplyScalar(u)).add(p0.clone().multiplyScalar(2).sub(p1.clone().multiplyScalar(5)).add(p2.clone().multiplyScalar(4)).sub(p3).multiplyScalar(u2)).add(p1.clone().multiplyScalar(3).sub(p0).sub(p2.clone().multiplyScalar(3)).add(p3).multiplyScalar(u3)).multiplyScalar(.5); }
function track(keys, t) { // keys: [[time, Vector3], ...]
  if (t <= keys[0][0]) return keys[0][1].clone(); const n = keys.length; if (t >= keys[n - 1][0]) return keys[n - 1][1].clone();
  let i = 0; while (t > keys[i + 1][0]) i++;
  const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const p0 = keys[Math.max(0, i - 1)][1], p1 = keys[i][1], p2 = keys[i + 1][1], p3 = keys[Math.min(n - 1, i + 2)][1];
  return cr(p0, p1, p2, p3, u);
}
const warp = (t, a, b) => a + (b - a) * smr(0, 1, (t - a) / (b - a)); // ease a whole track
function shake(t, amp) { return V(noise1(t * 1.7, 1) * amp, noise1(t * 1.9, 2) * amp, noise1(t * 1.3, 3) * amp); }
function director(t) {
  let p, l, fov = 40, focus = V(-40, 0, 0), ext = 60;
  if (t < 8) { // S1 aerial
    const tw = 8 * Math.pow(t / 8, 1.18);
    p = track([[0, V(430, 175, -360)], [3, V(300, 125, -235)], [5.8, V(150, 78, -110)], [8, V(10, 34, -42)]], tw);
    l = track([[0, V(-40, 40, 60)], [4, V(-70, 35, 30)], [8, V(-40, 6, 0)]], tw);
    fov = 42; focus = V(-40, 0, -40); ext = 300;
  } else if (t < 16) { // S2 busy street
    const tt = warp(t, 8, 16);
    p = track([[8, V(-35.0, 3.4, -38)], [11, V(-34.5, 2.3, -22)], [16, V(-33.6, 1.7, -9.2)]], tt);
    const bp = benny.root.position;
    const look2 = V(bp.x, 1.25, bp.z);
    l = V(-40, 3.2, 26).lerp(look2, sm(8.6, 11.2, t));
    p.add(shake(t, .05)); fov = lerp(46, 38, sm(8, 16, t)); focus = V(-40, 0, -6); ext = 45;
  } else if (t < 20.2) { // S3a — low side tracking shot, ocean & pier behind the car
    const h = heroState(t); const c = V(h.x, .6, h.z); const u = sm(16, 20.2, t);
    p = c.clone().add(V(-4.4, lerp(.45, .95, u), lerp(4.2, -3.6, u))); l = c.clone().add(V(0, .3, lerp(.8, -1.2, u)));
    p.add(shake(t, .025)); fov = lerp(36, 40, u); focus = c.clone(); ext = 35;
  } else if (t < 25.6) { // S3b front chase -> car pulls over -> reveal Benny
    const h = heroState(t); const c = V(h.x, .6, h.z);
    const u = smr(20.2, 23.2, t);
    const rel = c.clone().add(V(lerp(-2.6, .4, u), lerp(.65, 1.15, u), lerp(-6.8, -8.8, u)));
    const abs = track([[22.6, V(39.6, 1.3, -9)], [23.6, V(42.5, 1.5, -10.5)], [24.6, V(48.5, 1.75, -6.5)], [25.6, V(50.6, 1.62, 1.95)]], t);
    p = rel.lerp(abs, smr(22.6, 24.2, t));
    l = c.clone().add(V(0, .3, 0)).lerp(V(46.0, 1.1, .4), smr(24.0, 25.5, t));
    p.add(shake(t, .02 * (1 - sm(24, 25, t))));
    fov = lerp(40, 36, sm(23.5, 25.6, t)); focus = V(h.x, 0, h.z * .5); ext = 30;
  } else if (t < 32) { // S4 — selfie & splash
    p = track([[25.6, V(50.6, 1.62, 1.95)], [27.4, V(50.1, 1.55, 1.55)], [28.4, V(49.7, 1.55, 1.35)], [29.4, V(48.75, 1.68, .95)], [32, V(48.5, 1.72, .85)]], t);
    l = track([[25.6, V(46.0, 1.1, .4)], [27.4, V(46.0, 1.18, .25)], [28.4, V(46.05, 1.3, .2)], [29.4, V(46.2, 1.62, .2)], [32, V(46.2, 1.66, .2)]], t);
    p.add(shake(t, .012)); if (t > 27.7 && t < 28.3) p.add(shake(t * 6, .06 * (1 - (t - 27.7) / .6)));
    fov = lerp(34, 30, sm(28.4, 29.6, t)); focus = V(45, 0, 0); ext = 18;
  } else { // S5 crane up to night boulevard + S6 skyline
    p = track([[32, V(48.5, 1.72, .85)], [33.6, V(56, 7, -6)], [35.6, V(68, 19, -20)], [37.6, V(56, 10, 10)], [40, V(45.5, 5, 46)], [42.5, V(78, 30, 120)], [45, V(170, 85, 175)], [48, V(300, 150, 210)]], t);
    l = track([[32, V(46.2, 1.65, .2)], [33.6, V(36, 6, 8)], [35.6, V(16, 10, 18)], [37.6, V(20, 7, 50)], [40, V(26, 5, 110)], [42.5, V(30, 22, 60)], [45, V(-40, 40, -10)], [48, V(-80, 30, -40)]], t);
    fov = lerp(30, 42, sm(32, 34.5, t)); fov = lerp(fov, 44, sm(40, 44, t));
    focus = V(30, 0, 20); ext = 120;
  }
  return { p, l, fov, focus, ext };
}

// ================================================================ OVERLAYS
const $ = id => document.getElementById(id);
function letterize(el, txt) { el.innerHTML = [...txt].map(ch => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join(''); return [...el.children]; }
let t1L, t2L;
function project(v) { const q = v.clone().project(camera); return [(q.x * .5 + .5) * SW, (-q.y * .5 + .5) * SH, q.z < 1]; }
function placeComic(el, world, t, t0, t1, rot = -8, scale = 1, dx = 0, dy = 0) {
  const k = win(t, t0, t1, .08, .2); el.style.opacity = k > 0 ? Math.min(1, k * 1.5) : 0; if (k <= 0) return;
  const [x, y] = world ? project(world) : [SW / 2, SH / 2]; const pop = 1 + .35 * Math.sin(clamp((t - t0) / .25) * Math.PI) * (1 - clamp((t - t0) / .25)) + .5 * (1 - sm(t0, t0 + .12, t));
  el.style.transform = `translate(${x + dx * SW / 100}px, ${y + dy * SW / 100}px) translate(-50%,-50%) rotate(${rot + Math.sin(t * 20) * 1.5}deg) scale(${scale * pop})`;
}
function updateOverlays(t) {
  // flashes between shots
  const fl = Math.max(win(t, 7.72, 8.32, .28, .32), win(t, 15.82, 16.3, .18, .3) * .9);
  $('flash').style.opacity = fl;
  $('black').style.opacity = Math.max(1 - sm(0, .6, t), sm(47.45, 48, t));
  // title 1
  const T1 = win(t, 1.6, 7.6, .4, .55); const t1 = $('t1'); t1.style.opacity = T1;
  t1.style.transform = `scale(${lerp(1.08, 1, sm(1.6, 3, t)) + sm(7.0, 7.6, t) * .25})`;
  t1.querySelector('.pre').style.opacity = sm(1.7, 2.3, t);
  t1L.forEach((s, i) => { const a = 2.15 + i * .09; const k = sm(a, a + .28, t); const flick = t < a + .5 && Math.sin(t * 80 + i) > .6 ? .45 : 1; s.style.opacity = k * flick; s.style.transform = `translateY(${(1 - k) * -40}%) scale(${lerp(1.7, 1, k)})`; });
  $('t1tag').style.opacity = sm(3.6, 4.3, t); $('t1tag').style.transform = `translateY(${(1 - sm(3.6, 4.3, t)) * 30}%)`;
  // comics
  const taxi = traffic.find(v => v.honk === 1), coupe = traffic.find(v => v.honk === 2);
  placeComic($('honk1'), taxi.car.grp.position.clone().add(V(0, 2.4, 0)), t, 11.6, 12.7, -10, 1);
  placeComic($('honk2'), coupe.car.grp.position.clone().add(V(0, 2.2, 0)), t, 13.15, 14.35, 9, 1.25);
  const bh = benny.root.position.clone().add(V(0, 2.2, 0));
  placeComic($('click1'), bh, t, 26.42, 26.85, -6, .55, 7, -3);
  placeComic($('click2'), bh, t, 27.15, 27.55, 7, .55, -8, -4);
  placeComic($('ding'), bike.g.position.clone().add(V(0, 1.8, 0)), t, 26.95, 27.5, -5, .55);
  placeComic($('splash'), PUDDLE.clone().add(V(.8, 1.4, 0)), t, 27.68, 28.75, -7, 1.55);
  const bub = $('bubble'); const kb = win(t, 29.65, 31.25, .12, .2); bub.style.opacity = kb;
  if (kb > 0) { const [x, y] = project(benny.root.position.clone().add(V(0, 1.9, -.45))); bub.style.transform = `translate(${x + SW * .07}px, ${y - SW * .02}px) scale(${lerp(.6, 1, sm(29.65, 29.85, t))})`; }
  // final title
  const T2 = sm(42.6, 43.2, t); $('t2').style.opacity = T2; $('t2').style.transform = `translateY(${(1 - T2) * 2}%)`;
  t2L.forEach((s, i) => { const a = 42.7 + i * .1; const on = t > a ? (t < a + .45 && Math.sin(t * 70 + i * 3) > .35 ? .3 : 1) : 0; s.style.opacity = on; });
  const tg = $('t2tag'); const kt = sm(44.0, 44.9, t); tg.style.opacity = kt; tg.style.letterSpacing = `calc(var(--u) * ${lerp(1.2, .45, kt)})`;
}

// ================================================================ MAIN
let composer, bloom, grade;
function buildPost() {
  const rt = new THREE.WebGLRenderTarget(SW, SH, { type: THREE.HalfFloatType, samples: RENDER ? 4 : 2 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(SW, SH), .5, .55, 1.0); composer.addPass(bloom);
  grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uNight: { value: 0 }, uVig: { value: .9 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uNight, uVig; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
        float l = dot(col, vec3(.299,.587,.114)); col = mix(vec3(l), col, 1.12 + uNight*.12);
        col *= mix(vec3(1.04,1.0,.95), vec3(.96,.95,1.08), uNight);
        vec2 d = vUv - .5; float v = 1. - dot(d,d) * uVig; col *= v;
        gl_FragColor = vec4(col, c.a); }` });
  composer.addPass(grade);
  composer.addPass(new OutputPass());
}
function renderAt(t) {
  G.t = t; G.night = smr(32.4, 37.2, t);
  updateBenny(t); updatePeds(t); updateCyclist(t); updateTraffic(t); updateSplash(t); updateNeon(t);
  for (const f of updaters) f(t);
  const d = director(t);
  camera.position.copy(d.p); camera.lookAt(d.l); camera.fov = d.fov; camera.updateProjectionMatrix();
  updateSky(t, d.focus, d.ext);
  sun.castShadow = G.night < .7;
  renderer.toneMappingExposure = lerp(1.0, .95, G.night);
  bloom.strength = lerp(.35, .7, G.night); bloom.threshold = lerp(1.05, .95, G.night); bloom.radius = lerp(.45, .55, G.night);
  grade.uniforms.uNight.value = G.night;
  updateOverlays(t);
  composer.render();
}

async function init() {
  const msg = $('lmsg');
  try { await Promise.all(['150px Bungee', '100px Pacifico', '60px "Bebas Neue"'].map(f => document.fonts.load(f))); } catch (e) { }
  layout();
  makeRoadMats(); makeWindowStyles(); buildSky();
  buildGround(); buildDowntown(); buildHotels(); buildBeach(); buildInfra(); buildStreetProps(); buildRoofs(); buildLamps(); buildPalms();
  buildBoats(); buildCast(); buildTraffic(); buildSplash(); buildSearchlights(); buildPost();
  t1L = letterize($('t1big'), 'NEON BAY'); t2L = letterize($('t2big'), 'NEON BAY');
  addEventListener('resize', layout);
  // warm up shaders / env maps
  for (const n of [0, .5, 1]) envFor(n);
  renderAt(0.01);
  window.renderAt = t => { renderAt(t); return true; };
  window.NB_READY = true;
  if (RENDER) { $('loading').remove(); $('ui').remove(); return; }
  startViewer();
}

function startViewer() {
  const play = $('play'), scrub = $('scrub'), time = $('time'), snd = $('snd'), load = $('loading'), start = $('start');
  const audio = new Audio('soundtrack.mp3'); audio.preload = 'auto';
  let playing = false, t = 0, last = performance.now(), muted = false;
  const setT = v => { t = clamp(v, 0, DUR); scrub.value = t; time.textContent = `${t.toFixed(1)} / 48.0s`; };
  const sync = () => { if (!muted && playing) { if (Math.abs(audio.currentTime - t) > .25) audio.currentTime = t; audio.play().catch(() => { }); } else audio.pause(); };
  const toggle = () => { playing = !playing; if (playing && t >= DUR - .01) setT(0); play.textContent = playing ? '❚❚' : '▶'; last = performance.now(); sync(); };
  play.onclick = toggle; snd.onclick = () => { muted = !muted; snd.textContent = muted ? '🔇' : '🔊'; sync(); };
  scrub.oninput = () => { setT(+scrub.value); renderAt(t); if (playing) { audio.currentTime = t; } };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
  $('lmsg').textContent = 'Ready — 48 second cinematic short'; start.style.display = 'block';
  start.onclick = () => { load.remove(); $('ui').classList.add('show'); setTimeout(() => $('ui').classList.remove('show'), 2500); toggle(); };
  const loop = now => { const dt = Math.min(.1, (now - last) / 1000); last = now; if (playing) { setT(t + dt); if (t >= DUR) { playing = false; play.textContent = '▶'; audio.pause(); } } renderAt(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
init().catch(e => { console.error(e); const l = $('lmsg'); if (l) l.textContent = 'Error: ' + e.message; window.NB_ERROR = String(e && e.stack || e); });

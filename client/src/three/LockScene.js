// The Latch lock: a machined vault dial with twelve pins, one per backup word.
// Built procedurally so there is no model file to download.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';

const BRASS = 0xd9a441, STEEL = 0x141c6b, BONE = 0xf2eee3, INK = 0x070b33, GLOW = 0xffe2a0;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (t) => t * t * (3 - 2 * t);

function setup(canvas, fov = 35, dist = 9) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 60);
  camera.position.z = dist;
  const view = { w: 1, h: 1 };
  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    view.h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2)); view.w = view.h * camera.aspect;
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const key = new THREE.DirectionalLight(0xfff1d6, 2.4); key.position.set(-4, 5, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f86ff, 3.2); rim.position.set(6, -2, -4); scene.add(rim);

  let raf = 0, visible = true, last = performance.now();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(canvas);
  const run = (tick) => {
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (!visible || document.hidden) return;
      tick(dt); renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
  };
  const dispose = () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    scene.environment?.dispose(); renderer.dispose();
  };
  return { renderer, scene, camera, view, run, dispose };
}

// A ring with chamfered edges, turned on a lathe, facing the camera.
function ring(rIn, rOut, depth, bevel = 0.04) {
  const d = depth / 2, b = bevel;
  const pts = [[rIn + b, -d], [rOut - b, -d], [rOut, -d + b], [rOut, d - b], [rOut - b, d], [rIn + b, d], [rIn, d - b], [rIn, -d + b], [rIn + b, -d]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 160);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

const metal = (color, roughness = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, flatShading: false });

function around(count, radius, geometry, material, each) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    m.position.set(Math.sin(a) * radius, Math.cos(a) * radius, 0);
    m.rotation.set(0, 0, -a); m.scale.set(1, 1, 1);
    each?.(m, i); m.updateMatrix(); mesh.setMatrixAt(i, m.matrix);
  }
  return mesh;
}

// Banknote-style engraving: a band of phase-shifted rosette curves.
function guilloche(r0, amp, lobes, strands, opacity) {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity, depthWrite: false });
  for (let s = 0; s < strands; s++) {
    const phase = (s / strands) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * Math.PI * 2;
      const r = r0 + amp * Math.sin(lobes * t + phase) + amp * 0.35 * Math.sin(lobes * 2.5 * t - phase * 2);
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0));
    }
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return group;
}

function coinFace(glyph, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const base = new THREE.Color(color);
  const g = x.createRadialGradient(100, 90, 20, 128, 128, 140);
  g.addColorStop(0, `#${base.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString()}`);
  g.addColorStop(1, `#${base.clone().multiplyScalar(0.72).getHexString()}`);
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 128, 0, 7); x.fill();
  x.strokeStyle = 'rgba(7,11,51,.55)'; x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 108, 0, 7); x.stroke();
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; x.beginPath(); x.arc(128 + Math.cos(a) * 117, 128 + Math.sin(a) * 117, 2.2, 0, 7); x.fillStyle = 'rgba(7,11,51,.5)'; x.fill(); }
  x.fillStyle = '#070b33'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 124px "Bodoni Moda", Didot, "Times New Roman", serif';
  x.fillText(glyph, 128, 138);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function makeCoin({ glyph, color }, r = 0.36) {
  const g = new THREE.Group(), h = r * 0.16;
  const edge = new THREE.Mesh(ring(r * 0.86, r, h, h * 0.3), metal(color, 0.32));
  const faceMat = new THREE.MeshStandardMaterial({ map: coinFace(glyph, color), metalness: 0.85, roughness: 0.38 });
  const front = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 64), faceMat); front.position.z = h * 0.3;
  const back = front.clone(); back.position.z = -h * 0.3; back.rotation.y = Math.PI;
  g.add(edge, front, back);
  return g;
}

/**
 * Full lock scene.
 *  mode 'hero'  : fixed behind the landing page, driven by setStage(0..3)
 *  mode 'panel' : centred in its box (onboarding, unlock)
 */
export function createLockScene(canvas, { mode = 'hero', coins = [] } = {}) {
  const base = setup(canvas);
  const { scene, view } = base;
  const still = reduced();

  const root = new THREE.Group(); scene.add(root);
  const tilt = new THREE.Group(); root.add(tilt);

  // layers, back to front
  const plate = new THREE.Group();
  plate.add(new THREE.Mesh(ring(0.2, 2.62, 0.08, 0.02), metal(INK, 0.55)));
  const g1 = guilloche(2.05, 0.2, 12, 9, 0.5); g1.position.z = 0.05;
  plate.add(g1);
  const halo = guilloche(3.25, 0.34, 16, 14, 0.3); halo.position.z = -0.3;

  const outer = new THREE.Group();
  outer.add(new THREE.Mesh(ring(1.74, 2.26, 0.34, 0.06), metal(BRASS, 0.26)));
  const pinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 32); pinGeo.rotateX(Math.PI / 2);
  const pins = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(pinGeo, new THREE.MeshStandardMaterial({ color: INK, metalness: 0.6, roughness: 0.35, emissive: GLOW, emissiveIntensity: 0 }));
    m.position.set(Math.sin(a) * 2, Math.cos(a) * 2, 0.14);
    m.userData.glow = 0; outer.add(m);
    return m;
  });

  const mid = new THREE.Group();
  mid.add(new THREE.Mesh(ring(1.2, 1.68, 0.26, 0.05), metal(STEEL, 0.34)));
  const tickMat = new THREE.MeshStandardMaterial({ color: BONE, emissive: BONE, emissiveIntensity: 0.25, roughness: 0.6 });
  const ticks = around(60, 1.47, new THREE.BoxGeometry(0.018, 0.13, 0.02), tickMat, (m, i) => { if (i % 5 === 0) m.scale.set(1.8, 1.7, 1); });
  ticks.position.z = 0.135; mid.add(ticks);

  const inner = new THREE.Group();
  inner.add(new THREE.Mesh(ring(0.72, 1.1, 0.4, 0.05), metal(BRASS, 0.3)));
  inner.add(around(44, 1.12, new THREE.BoxGeometry(0.07, 0.08, 0.34), metal(BRASS, 0.36)));

  const hub = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: BONE, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }));
  dome.rotation.x = Math.PI / 2; dome.scale.y = 0.38; dome.position.z = 0.08;
  const key = new THREE.Shape();
  key.absarc(0, 0.09, 0.13, -0.9, Math.PI + 0.9, false); key.lineTo(-0.1, -0.26); key.lineTo(0.1, -0.26); key.closePath();
  const keyhole = new THREE.Mesh(new THREE.ShapeGeometry(key, 32), new THREE.MeshBasicMaterial({ color: INK }));
  keyhole.position.z = 0.335;
  hub.add(dome, keyhole, new THREE.Mesh(ring(0.6, 0.72, 0.3, 0.04), metal(STEEL, 0.3)));

  const layers = [plate, outer, mid, inner, hub];
  tilt.add(halo, ...layers);

  const heart = new THREE.PointLight(GLOW, 0, 9, 1.6); heart.position.z = 1.6; tilt.add(heart);

  // orbiting coins
  const orbit = new THREE.Group(); root.add(orbit);
  const coinObjs = coins.slice(0, 8).map((c, i, arr) => {
    const o = makeCoin(c, 0.3 + (i % 3) * 0.05);
    o.userData = { r: 3.0 + (i % 4) * 0.34, a: (i / arr.length) * Math.PI * 2, speed: 0.1 + (i % 3) * 0.035, inc: -0.5 + (i % 5) * 0.26, spin: 0.5 + (i % 4) * 0.22 };
    orbit.add(o); return o;
  });

  // dust
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) { const a = Math.random() * 7, r = 2.6 + Math.random() * 4.5; dustPos.set([Math.cos(a) * r, Math.sin(a) * r * 0.8, -2.5 + Math.random() * 4.5], i * 3); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: BONE, size: 0.022, transparent: true, opacity: 0.55, depthWrite: false }));
  root.add(dust);

  // ---- state ----
  const intro = { plate: 0, outer: 0, mid: 0, inner: 0, hub: 0, coins: 0, halo: 0 };
  const fx = { pulse: 0, spin: 0 };
  const cur = { x: 0, y: 0, s: 1, e: 0, ry: 0, rx: 0 };
  let stage = 0, lit = 0, time = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };

  const stages = () => {
    const { w, h } = view;
    if (mode === 'panel') { const s = Math.min(w, h) / 7.4; return [{ x: 0, y: 0, s, e: 0, ry: -0.18, rx: 0.08 }]; }
    if (w > h * 1.05) {
      const s = Math.min(1, w / 9.5) * 0.8;
      return [
        { x: w * 0.25, y: -0.05, s, e: 0, ry: -0.38, rx: 0.12 },
        { x: -w * 0.25, y: 0, s: s * 0.74, e: 1, ry: 1.02, rx: 0.06 },
        { x: w * 0.4, y: h * 0.34, s: s * 0.5, e: 0, ry: -0.7, rx: 0.5 },
        { x: 0, y: h * 0.17, s: s * 0.62, e: 0, ry: 0, rx: 0 },
      ];
    }
    const s = w / 6.6;
    return [
      { x: 0, y: h * 0.22, s, e: 0, ry: -0.25, rx: 0.1 },
      { x: 0, y: h * 0.3, s: s * 0.72, e: 1, ry: 1.0, rx: 0.05 },
      { x: w * 0.3, y: h * 0.62, s: s * 0.5, e: 0, ry: -0.6, rx: 0.4 },
      { x: 0, y: h * 0.24, s: s * 0.8, e: 0, ry: 0, rx: 0 },
    ];
  };
  const target = () => {
    const st = stages(), i = Math.min(st.length - 1, Math.floor(stage)), j = Math.min(st.length - 1, i + 1), f = smooth(stage - i);
    const out = {}; for (const k in st[i]) out[k] = st[i][k] + (st[j][k] - st[i][k]) * f;
    return out;
  };

  Object.assign(cur, target());
  if (still) Object.keys(intro).forEach((k) => { intro[k] = 1; });
  else {
    gsap.timeline({ delay: 0.15 })
      .to(intro, { plate: 1, duration: 1.3, ease: 'expo.out' }, 0)
      .to(intro, { outer: 1, duration: 1.5, ease: 'expo.out' }, 0.12)
      .to(intro, { mid: 1, duration: 1.5, ease: 'expo.out' }, 0.26)
      .to(intro, { inner: 1, duration: 1.5, ease: 'expo.out' }, 0.4)
      .to(intro, { hub: 1, duration: 1.2, ease: 'back.out(1.6)' }, 0.62)
      .to(intro, { halo: 1, duration: 2.2, ease: 'power2.out' }, 0.5)
      .to(intro, { coins: 1, duration: 1.6, ease: 'expo.out' }, 0.8);
  }

  const onPointer = (e) => { ptr.tx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ty = (e.clientY / window.innerHeight) * 2 - 1; };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const spinDir = [0, 1, -1, 1, 0], spinRate = [0, 0.05, 0.09, 0.16, 0], layerKeys = ['plate', 'outer', 'mid', 'inner', 'hub'];
  const zRest = [-0.2, 0, 0.04, 0.1, 0.16], zExplode = [-1.5, -0.55, 0.45, 1.4, 2.3];

  base.run((dt) => {
    if (!still) time += dt;
    const k = 1 - Math.exp(-dt * 3.6), tg = target();
    for (const key in cur) cur[key] += (tg[key] - cur[key]) * k;
    ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;

    root.position.set(cur.x, cur.y, 0);
    root.scale.setScalar(cur.s * (1 + fx.pulse * 0.07));
    tilt.rotation.set(cur.rx + ptr.y * 0.16, cur.ry + ptr.x * 0.26, Math.sin(time * 0.3) * 0.02);

    layers.forEach((layer, i) => {
      const t = intro[layerKeys[i]];
      layer.scale.setScalar(Math.max(0.0001, t));
      layer.position.z = zRest[i] + cur.e * zExplode[i] - (1 - t) * 5;
      layer.rotation.z = spinDir[i] * (time * spinRate[i] + (1 - t) * 4 + fx.spin * (i + 1) * 0.5);
    });
    halo.scale.setScalar(0.6 + intro.halo * 0.4);
    halo.children[0].material.opacity = 0.3 * intro.halo * (1 - cur.e * 0.6);
    halo.rotation.z = -time * 0.02;
    g1.rotation.z = time * 0.03;

    let glowSum = 0;
    pins.forEach((p, i) => {
      const want = i < lit ? 1 : 0;
      p.userData.glow += (want - p.userData.glow) * (1 - Math.exp(-dt * 9));
      const g = p.userData.glow; glowSum += g;
      p.material.emissiveIntensity = g * (2.4 + Math.sin(time * 2 + i) * 0.25) + fx.pulse * 2;
      p.position.z = 0.14 + g * 0.07;
      p.scale.setScalar(1 + g * 0.12);
    });
    heart.intensity = (glowSum / 12) * 5 + fx.pulse * 14;

    coinObjs.forEach((o) => {
      const u = o.userData, a = u.a + time * u.speed;
      const x = Math.cos(a) * u.r, y = Math.sin(a) * u.r * 0.42, z = Math.sin(a) * 1.7;
      o.position.set(x * Math.cos(u.inc) - y * Math.sin(u.inc), x * Math.sin(u.inc) + y * Math.cos(u.inc), z);
      o.rotation.set(Math.sin(time * 0.4 + u.a) * 0.3, time * u.spin + u.a, 0);
      o.scale.setScalar(Math.max(0.0001, intro.coins) * (1 - cur.e * 0.35));
    });
    orbit.rotation.set(ptr.y * 0.08, ptr.x * 0.12, 0);
    dust.rotation.z = time * 0.012; dust.material.opacity = 0.55 * intro.halo;
  });

  return {
    setStage(v) { stage = Math.max(0, v); },
    setLit(n) { lit = n; },
    pulse() {
      if (still) return;
      gsap.fromTo(fx, { pulse: 1 }, { pulse: 0, duration: 1.4, ease: 'expo.out', overwrite: true });
      gsap.to(fx, { spin: fx.spin + 1.2, duration: 1.6, ease: 'expo.out' });
    },
    dispose() { window.removeEventListener('pointermove', onPointer); gsap.killTweensOf(intro); gsap.killTweensOf(fx); base.dispose(); },
  };
}

/** A single minted coin the user can drag to spin. */
export function createCoinScene(canvas, coin) {
  const base = setup(canvas, 30, 4);
  const still = reduced();
  let obj = null, vel = 0.9, drag = null, rot = 0.5;
  const set = (c) => {
    if (obj) { base.scene.remove(obj); obj.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); }); }
    obj = makeCoin(c, 0.82); base.scene.add(obj);
    if (!still) { vel = 9; gsap.fromTo(obj.scale, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'back.out(2)' }); }
  };
  set(coin);
  const down = (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag == null) return; vel = (e.clientX - drag) * 0.6; drag = e.clientX; };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  let t = 0;
  base.run((dt) => {
    t += dt;
    if (!still) { rot += vel * dt; vel += ((drag == null ? 0.7 : 0) - vel) * (1 - Math.exp(-dt * 1.6)); }
    obj.rotation.set(Math.sin(t * 0.7) * 0.12, rot, 0);
    obj.position.y = still ? 0 : Math.sin(t * 1.1) * 0.04;
  });
  return { set, dispose: base.dispose };
}

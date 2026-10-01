// Flowly · animação do copo (guia de design v2, pág. 13) — three.js 0.160.
// mount(elemento, opções) cria a cena, inicia o loop e devolve uma função
// que desmonta tudo.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GLASS_HEIGHT = 3.0;
const BASE_RADIUS = 0.95;
const MOUTH_RADIUS = 1.14;
const WALL = 0.06;
const BOTTOM = 0.2;
const USEFUL_HEIGHT = GLASS_HEIGHT - BOTTOM;

const DROP_CYCLE = 3.4;
const DROP_FALL_SHARE = 0.28;
const DROP_START_Y = GLASS_HEIGHT + 0.7;

const outerRadiusAt = (y) => BASE_RADIUS + (MOUTH_RADIUS - BASE_RADIUS) * (y / GLASS_HEIGHT);
const innerRadiusAt = (y) => outerRadiusAt(y) - WALL;

export async function mount(element, { level = 0.3, raw = 0.5, labels = {} } = {}) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => window.innerWidth <= 820;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  element.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  // Transmission needs something behind the glass to refract — a transparent
  // canvas made the glass read as flat white. The page background is a solid
  // color, so the scene paints exactly that color and blends in.
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const syncBackground = () => {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#EAF3FF';
    scene.background = new THREE.Color(css);
  };
  syncBackground();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 1.45, 0);

  const disposables = [envTexture];
  const track = (thing) => { disposables.push(thing); return thing; };

  // Soft blue glow under the glass.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 256;
  const g = glowCanvas.getContext('2d');
  const gradient = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(10,122,255,0.28)');
  gradient.addColorStop(1, 'rgba(10,122,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);
  const glow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(5.2, 2.4)),
    track(new THREE.MeshBasicMaterial({ map: track(new THREE.CanvasTexture(glowCanvas)), transparent: true, depthWrite: false })),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.01;
  scene.add(glow);

  const group = new THREE.Group();
  scene.add(group);

  // Glass: lathe of 96 sides, physical glass.
  const innerBottom = innerRadiusAt(BOTTOM);
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(BASE_RADIUS - 0.03, 0),
    new THREE.Vector2(BASE_RADIUS, 0.03),
    new THREE.Vector2(MOUTH_RADIUS, GLASS_HEIGHT),
    new THREE.Vector2(MOUTH_RADIUS - WALL, GLASS_HEIGHT),
    new THREE.Vector2(innerBottom, BOTTOM + 0.03),
    new THREE.Vector2(innerBottom - 0.03, BOTTOM),
    new THREE.Vector2(0, BOTTOM),
  ];
  const glass = new THREE.Mesh(
    track(new THREE.LatheGeometry(profile, 96)),
    track(new THREE.MeshPhysicalMaterial({
      color: 0xf4f9ff,
      transmission: 1,
      ior: 1.45,
      thickness: 0.35,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
    })),
  );
  group.add(glass);

  // Water up to the effective level. Opaque on purpose: a transmissive
  // object isn't visible through another transmissive one (the glass), so
  // the water would vanish behind it.
  const waterTop = BOTTOM + Math.max(Math.min(level, 1), 0.001) * USEFUL_HEIGHT;
  const waterMaterial = track(new THREE.MeshPhysicalMaterial({
    color: 0x6fb4ff,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    ior: 1.33,
    emissive: new THREE.Color(0x0a7aff),
    emissiveIntensity: 0.18,
    side: THREE.DoubleSide,
  }));
  const surfaceRadius = innerRadiusAt(waterTop) - 0.006;
  const water = new THREE.Mesh(
    track(new THREE.CylinderGeometry(surfaceRadius, innerRadiusAt(BOTTOM) - 0.006, waterTop - BOTTOM, 96, 1, true)),
    waterMaterial,
  );
  water.position.y = BOTTOM + (waterTop - BOTTOM) / 2;
  group.add(water);

  // Surface: 96 × 22 disc, displaced every frame.
  const SEGMENTS = 96;
  const RINGS = 22;
  const positions = new Float32Array((1 + SEGMENTS * RINGS) * 3);
  const radii = new Float32Array(1 + SEGMENTS * RINGS);
  const indices = [];
  positions[1] = 0;
  for (let ring = 1; ring <= RINGS; ring++) {
    const r = surfaceRadius * (ring / RINGS);
    for (let s = 0; s < SEGMENTS; s++) {
      const i = 1 + (ring - 1) * SEGMENTS + s;
      const a = (s / SEGMENTS) * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 2] = Math.sin(a) * r;
      radii[i] = r;
      const next = 1 + (ring - 1) * SEGMENTS + ((s + 1) % SEGMENTS);
      if (ring === 1) {
        indices.push(0, next, i);
      } else {
        const below = i - SEGMENTS;
        const belowNext = next - SEGMENTS;
        indices.push(below, belowNext, i, belowNext, next, i);
      }
    }
  }
  const surfaceGeometry = track(new THREE.BufferGeometry());
  surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  surfaceGeometry.setIndex(indices);
  const surface = new THREE.Mesh(surfaceGeometry, waterMaterial);
  surface.position.y = waterTop;
  group.add(surface);

  // "Bebido": 44 dashes in a ring at the raw level, #0A7AFF at 60%.
  const rawY = BOTTOM + Math.min(Math.max(raw, 0), 1) * USEFUL_HEIGHT;
  const rawRadius = outerRadiusAt(rawY) + 0.004;
  const dashLength = ((Math.PI * 2 * rawRadius) / 44) * 0.5;
  const dashGeometry = track(new THREE.BoxGeometry(dashLength, 0.014, 0.006));
  const dashMaterial = track(new THREE.MeshBasicMaterial({ color: 0x0a7aff, transparent: true, opacity: 0.6 }));
  for (let d = 0; d < 44; d++) {
    const a = (d / 44) * Math.PI * 2;
    const dash = new THREE.Mesh(dashGeometry, dashMaterial);
    dash.position.set(Math.cos(a) * rawRadius, rawY, Math.sin(a) * rawRadius);
    dash.rotation.y = -a + Math.PI / 2;
    group.add(dash);
  }

  // Drop: flattened sphere falling every 3.4 s.
  const drop = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 32, 20)), waterMaterial);
  drop.scale.set(1, 0.8, 1);
  group.add(drop);

  // 7 rising bubbles.
  const bubbleGeometry = track(new THREE.SphereGeometry(1, 12, 8));
  const bubbles = Array.from({ length: 7 }, (_, i) => {
    const material = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }));
    const mesh = new THREE.Mesh(bubbleGeometry, material);
    mesh.renderOrder = 2;
    const size = 0.022 + (i % 3) * 0.009;
    mesh.scale.setScalar(size);
    const angle = (i / 7) * Math.PI * 2 + i;
    const dist = 0.15 + ((i * 37) % 10) / 10 * (surfaceRadius * 0.6);
    group.add(mesh);
    return { mesh, material, x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, offset: i / 7, speed: 0.16 + (i % 4) * 0.03 };
  });

  // Labels: 3D points on the glass edge, projected each frame.
  const effAnchor = new THREE.Vector3(outerRadiusAt(waterTop) + 0.08, waterTop, 0);
  const rawAnchor = new THREE.Vector3(-(outerRadiusAt(rawY) + 0.08), rawY, 0);
  const projected = new THREE.Vector3();

  const pointer = { x: 0, y: 0 };
  const rotation = { x: 0, y: 0 };
  const onPointerMove = (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener('pointermove', onPointerMove, { passive: true });
  const onSchemeChange = () => { syncBackground(); if (reducedMotion) render(0); };
  darkQuery.addEventListener('change', onSchemeChange);

  let width = 1;
  let height = 1;
  const resize = () => {
    width = Math.max(element.clientWidth, 1);
    height = Math.max(element.clientHeight, 1);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = width / height;
    if (isPhone()) camera.position.set(0, 1.6, 11.5);
    else camera.position.set(0, 1.75, 10);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (reducedMotion) render(0);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(element);

  let impactTime = -Infinity;
  let lastCycle = -1;

  function updateSurface(t) {
    const attribute = surfaceGeometry.attributes.position;
    const sinceImpact = t - impactTime;
    const front = sinceImpact * 0.9;
    for (let i = 0; i < radii.length; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      let y = 0;
      if (!reducedMotion) {
        y += 0.012 * Math.sin(x * 2.4 + t * 1.3);
        y += 0.01 * Math.sin(z * 3.1 - t * 1.7 + x);
        const r = radii[i];
        if (sinceImpact >= 0 && sinceImpact < 4 && r <= front) {
          y += 0.05 * Math.exp(-1.6 * sinceImpact) * Math.exp(-1.4 * r) * Math.cos(Math.PI * 2 * 14 * (front - r));
        }
      }
      positions[i * 3 + 1] = y;
    }
    attribute.needsUpdate = true;
    surfaceGeometry.computeVertexNormals();
  }

  function updateDrop(t) {
    if (reducedMotion) { drop.visible = false; return; }
    const cycle = Math.floor(t / DROP_CYCLE);
    const phase = (t % DROP_CYCLE) / DROP_CYCLE;
    if (phase < DROP_FALL_SHARE) {
      const p = phase / DROP_FALL_SHARE;
      drop.visible = true;
      drop.position.set(0, DROP_START_Y - (DROP_START_Y - waterTop) * p * p, 0);
    } else {
      if (cycle !== lastCycle) {
        lastCycle = cycle;
        impactTime = cycle * DROP_CYCLE + DROP_FALL_SHARE * DROP_CYCLE;
      }
      // Hangs above the mouth, growing back before the next fall.
      const grow = Math.min(Math.max((phase - 0.7) / 0.3, 0), 1);
      drop.visible = grow > 0.02;
      drop.position.set(0, DROP_START_Y, 0);
      drop.scale.set(grow, grow * 0.8, grow);
      return;
    }
    drop.scale.set(1, 0.8, 1);
  }

  function updateBubbles(t) {
    for (const bubble of bubbles) {
      if (reducedMotion) { bubble.mesh.visible = false; continue; }
      const p = ((t * bubble.speed) + bubble.offset) % 1;
      bubble.mesh.position.set(bubble.x, BOTTOM + 0.05 + p * (waterTop - BOTTOM - 0.08), bubble.z);
      bubble.material.opacity = 0.55 * (1 - p);
    }
  }

  function placeLabel(label, anchor, alignRight) {
    if (!label) return;
    projected.copy(anchor);
    group.localToWorld(projected);
    projected.project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${alignRight ? '-100%' : '0'}, -50%)`;
  }

  function render(t) {
    if (!reducedMotion) {
      const sway = 0.25 * Math.sin((t / 25) * Math.PI * 2);
      rotation.y += (sway + pointer.x * 0.7 - rotation.y) * 0.05;
      rotation.x += (pointer.y * 0.12 - rotation.x) * 0.05;
      group.rotation.set(rotation.x, rotation.y, 0);
    }
    updateSurface(t);
    updateDrop(t);
    updateBubbles(t);
    renderer.render(scene, camera);
    placeLabel(labels.eff, effAnchor, false);
    placeLabel(labels.raw, rawAnchor, true);
  }

  let frame = 0;
  const clock = new THREE.Clock();
  const loop = () => {
    render(clock.getElapsedTime());
    frame = requestAnimationFrame(loop);
  };
  resize();
  if (reducedMotion) render(0);
  else frame = requestAnimationFrame(loop);

  return function dispose() {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointerMove);
    darkQuery.removeEventListener('change', onSchemeChange);
    resizeObserver.disconnect();
    for (const thing of disposables) thing.dispose?.();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

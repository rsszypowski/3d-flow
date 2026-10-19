import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fields, derivatives } from './fields.js';
import { Simulation } from './simulation.js';
import './style.css';

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07111f);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 1000); camera.position.set(8, 7, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.querySelector('#scene').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 2));
const grid = new THREE.GridHelper(12, 12, 0x31506c, 0x1a2d42); grid.rotation.x = Math.PI / 2; scene.add(grid);
const axes = new THREE.AxesHelper(2); scene.add(axes);

const geometry = new THREE.BoxGeometry(1, 1, 1);
function makeMaterial(color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .1, transparent: true, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;');
    shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );');
  };
  return material;
}
const palette = [0x2756a8, 0x3178c6, 0x3f9ed0, 0x58c7ff, 0xd6e8bf, 0xf2d36b, 0xf2a34a, 0xe06a43, 0xb72e45];
const materials = palette.map(makeMaterial);
let meshes = [];
let alphaAttributes = [];
let pathMesh = null;
const arrows = new THREE.Group(); scene.add(arrows);
const arrowPoints = [];
for (let x = -4; x <= 4; x += 2) for (let y = -4; y <= 4; y += 2) for (let z = -4; z <= 4; z += 2) arrowPoints.push(new THREE.Vector3(x, y, z));
function updateArrows() {
  arrows.clear();
  for (const point of arrowPoints) {
    const velocity = fields[fieldSelect.value].velocity(point);
    const magnitude = velocity.length();
    if (magnitude < 1e-5) continue;
    const arrow = new THREE.ArrowHelper(velocity.normalize(), point, Math.min(1.1, magnitude * .35), 0x77aaff, .12, .06);
    arrows.add(arrow);
  }
  arrows.visible = $('vectors').checked;
}
function rebuildPaths() {
  if (pathMesh) { scene.remove(pathMesh); pathMesh.geometry.dispose(); pathMesh.material.dispose(); }
  const segments = 23; const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(simulation.items.length * segments * 2 * 3), 3));
  pathMesh = new THREE.LineSegments(pathGeometry, new THREE.LineBasicMaterial({ color: 0x6abfe8, transparent: true, opacity: .3 }));
  pathMesh.visible = $('paths').checked; scene.add(pathMesh);
}
function updatePaths() {
  if (!pathMesh) return;
  const positions = pathMesh.geometry.attributes.position.array; let offset = 0;
  for (const item of simulation.items) for (let i = 1; i < 24; i++) { const a = item.path[Math.max(0, item.path.length - 24 + i - 1)] || item.position; const b = item.path[Math.max(0, item.path.length - 24 + i)] || item.position; positions[offset++] = a.x; positions[offset++] = a.y; positions[offset++] = a.z; positions[offset++] = b.x; positions[offset++] = b.y; positions[offset++] = b.z; }
  pathMesh.geometry.attributes.position.needsUpdate = true;
}
let simulation = new Simulation(250, fields.uniform); let running = true; let last = performance.now();
const $ = id => document.querySelector(`#${id}`); const fieldSelect = $('field');
for (const [key, field] of Object.entries(fields)) fieldSelect.add(new Option(field.name, key));

function rebuild() {
  simulation.setSeed(+$('seed').value);
  simulation.lifetimeMin = Math.min(+$('lifetimeMin').value, +$('lifetimeMax').value - 1);
  simulation.lifetimeMax = Math.max(+$('lifetimeMax').value, simulation.lifetimeMin + 1);
  simulation.set(+$('count').value, fields[fieldSelect.value]);
  simulation.fadeDuration = +$('fadeDuration').value;
  simulation.integrator = $('integrator').value;
  simulation.boundaryMode = $('boundary').value;
  for (const oldMesh of meshes) { scene.remove(oldMesh); oldMesh.geometry.dispose(); }
  meshes = [];
  alphaAttributes = [];
  for (let group = 0; group < palette.length; group++) {
    const instanceGeometry = geometry.clone();
    const mesh = new THREE.InstancedMesh(instanceGeometry, materials[group], simulation.items.length);
    mesh.count = 0;
    const alphaAttribute = new THREE.InstancedBufferAttribute(new Float32Array(simulation.items.length), 1);
    instanceGeometry.setAttribute('instanceAlpha', alphaAttribute);
    meshes.push(mesh);
    alphaAttributes.push(alphaAttribute);
    scene.add(mesh);
  }
  rebuildPaths();
  updateArrows();
}
function updateLabels() { $('countValue').value = $('count').value; $('alphaValue').value = (+$('alpha').value).toFixed(2); $('fadeValue').value = `${(+$('fadeDuration').value).toFixed(1)}s`; $('lifetimeMinValue').value = `${$('lifetimeMin').value}s`; $('lifetimeMaxValue').value = `${$('lifetimeMax').value}s`; $('curlValue').value = (+$('curlStrength').value).toFixed(2); $('growthValue').value = (+$('growthRate').value).toFixed(2); $('dtValue').value = (+$('dt').value).toFixed(3); $('colorScaleValue').value = (+$('colorScale').value).toFixed(2); $('hysteresisValue').value = (+$('hysteresis').value).toFixed(2); const growth = $('mode').value === 'divergence'; $('growthControl').style.display = growth ? 'block' : 'none'; $('curlControl').style.display = $('mode').value === 'particles' ? 'none' : 'block'; simulation.fadeDuration = +$('fadeDuration').value; simulation.integrator = $('integrator').value; simulation.boundaryMode = $('boundary').value; }
function updateInfo() { const field = fields[fieldSelect.value]; $('fieldInfo').innerHTML = `<strong>${field.name}</strong><br><code>${field.equation}</code><br>${field.description}`; }
function syncUrl() { const params = new URLSearchParams({ field: fieldSelect.value, mode: $('mode').value, count: $('count').value, alpha: $('alpha').value, fade: $('fadeDuration').value, lmin: $('lifetimeMin').value, lmax: $('lifetimeMax').value, color: $('colorMode').value, scale: $('colorScale').value, hyst: $('hysteresis').value, boundary: $('boundary').value, integrator: $('integrator').value, seed: $('seed').value, deform: $('deform').checked ? '1' : '0' }); history.replaceState(null, '', `${location.pathname}?${params}`); }
function loadUrl() { const p = new URLSearchParams(location.search); const set = (id, key = id) => { if (p.has(key)) $(id).value = p.get(key); }; set('field'); set('mode'); set('count'); set('alpha'); set('fadeDuration', 'fade'); set('lifetimeMin', 'lmin'); set('lifetimeMax', 'lmax'); set('colorMode', 'color'); set('colorScale', 'scale'); set('hysteresis', 'hyst'); set('boundary'); set('integrator'); set('seed'); if (p.get('deform') === '1') $('deform').checked = true; }
function setCamera(name) { const views = { top: [0, 12, 0], front: [0, 0, 12], side: [12, 0, 0], iso: [8, 7, 10] }; camera.position.set(...views[name]); controls.target.set(0, 0, 0); controls.update(); }
function updateDiagnostics(event) { const rect = renderer.domElement.getBoundingClientRect(); const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, camera); const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) return; const field = fields[fieldSelect.value]; const velocity = field.velocity(hit); const { curl, divergence } = derivatives(field, hit); $('diagnostics').innerHTML = `<strong>Local field</strong><br>p = (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}, 0.00)<br>|v| = ${velocity.length().toFixed(3)}<br>curl = (${curl.x.toFixed(2)}, ${curl.y.toFixed(2)}, ${curl.z.toFixed(2)})<br>divergence = ${divergence.toFixed(3)}`; }
loadUrl(); updateLabels(); updateInfo(); rebuild(); syncUrl();
['count', 'alpha', 'fadeDuration', 'lifetimeMin', 'lifetimeMax', 'curlStrength', 'growthRate', 'dt', 'mode', 'colorScale', 'hysteresis', 'integrator', 'boundary', 'deform', 'seed'].forEach(id => $(id).addEventListener('input', () => { updateLabels(); if (id === 'count' || id === 'seed' || id === 'lifetimeMin' || id === 'lifetimeMax') rebuild(); syncUrl(); }));
fieldSelect.addEventListener('change', () => { rebuild(); updateInfo(); syncUrl(); }); $('colorMode').addEventListener('change', syncUrl); $('vectors').addEventListener('change', () => { arrows.visible = $('vectors').checked; }); $('paths').addEventListener('change', () => { pathMesh.visible = $('paths').checked; }); $('reset').addEventListener('click', rebuild); $('pause').addEventListener('click', () => { running = !running; $('pause').textContent = running ? 'Pause' : 'Resume'; }); $('share').addEventListener('click', async () => { syncUrl(); await navigator.clipboard?.writeText(location.href); $('share').textContent = 'Link copied'; setTimeout(() => $('share').textContent = 'Copy share link', 1200); }); document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera))); renderer.domElement.addEventListener('pointermove', updateDiagnostics);

const matrix = new THREE.Matrix4();
function bandFor(item) {
  const mode = $('colorMode').value;
  if (mode === 'fixed') return 2;
  const scale = +$('colorScale').value;
  const hysteresis = +$('hysteresis').value;
  const thresholds = mode === 'velocity'
    ? [.25, .5, .9, 1.4, 2, 2.8, 4, 6].map(value => value * scale)
    : mode === 'curl'
      ? [.1, .25, .5, .8, 1.2, 1.8, 2.5, 4].map(value => value * scale)
      : [-1, -.5, -.2, -.05, .05, .2, .5, 1].map(value => value * scale);
  const value = mode === 'velocity' ? item.velocity.length() : mode === 'curl' ? item.curl.length() : item.divergence;
  const band = thresholds.findIndex(threshold => value < threshold);
  let target = band === -1 ? palette.length - 1 : band;
  if (item.band !== undefined && target !== item.band) {
    if (target > item.band && value < thresholds[item.band] + hysteresis) target = item.band;
    if (target < item.band && value >= thresholds[target] - hysteresis) target = item.band;
  }
  item.band = target;
  return target;
}
function animate(now) { requestAnimationFrame(animate); const dt = Math.min((now - last) / 1000, .05); last = now; if (running) simulation.step(Math.min(dt, +$('dt').value), $('mode').value, +$('curlStrength').value, +$('growthRate').value, $('deform').checked); const groupIndices = Array(palette.length).fill(0); for (let i = 0; i < simulation.items.length; i++) { const item = simulation.items[i]; const group = bandFor(item); const localIndex = groupIndices[group]++; matrix.compose(item.position, item.quaternion, new THREE.Vector3(item.size * item.scale.x, item.size * item.scale.y, item.size * item.scale.z)); meshes[group].setMatrixAt(localIndex, matrix); alphaAttributes[group].setX(localIndex, item.opacity * +$('alpha').value); } for (let group = 0; group < palette.length; group++) { meshes[group].count = groupIndices[group]; meshes[group].instanceMatrix.needsUpdate = true; alphaAttributes[group].needsUpdate = true; } updatePaths(); controls.update(); renderer.render(scene, camera); }
requestAnimationFrame(animate);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

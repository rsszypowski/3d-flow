import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fields, derivatives } from './fields.js';
import { Simulation, trailMaxPoints } from './simulation.js';
import './style.css';

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07111f);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 1000); camera.position.set(8, 7, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.querySelector('#scene').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 2));
const grid = new THREE.GridHelper(12, 12, 0x31506c, 0x1a2d42); grid.rotation.x = Math.PI / 2; scene.add(grid);
const axes = new THREE.AxesHelper(2); scene.add(axes);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const edgeGeometry = new THREE.EdgesGeometry(geometry);
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
function makeBorderMaterial() {
  const material = new THREE.LineBasicMaterial({ color: 0x050505, transparent: true, opacity: .95, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute mat4 instanceMatrix;\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;\ntransformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;');
    shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );');
  };
  return material;
}
const palette = [0x234b9b, 0x2b62b1, 0x347fc5, 0x419bd1, 0x58c7ff, 0x8dd8e2, 0xd6e8bf, 0xf4e28a, 0xf2c45b, 0xf2a34a, 0xe77b45, 0xd94b5b, 0xb72e45];
const materials = palette.map(makeMaterial);
const colorNames = { fixed: 'Fixed blue', velocity: 'Velocity magnitude |v|', curl: 'Curl magnitude |curl|', divergence: 'Divergence' };
function updateLegend() {
  const mode = $('colorMode').value;
  const scale = +$('colorScale').value;
  $('legendTitle').textContent = colorNames[mode];
  const legendColors = mode === 'fixed' ? [palette[Math.floor(palette.length / 2)]] : palette;
  $('legendSwatches').style.gridTemplateColumns = mode === 'fixed' ? '1fr' : 'repeat(13, 1fr)';
  $('legendSwatches').innerHTML = legendColors.map(color => `<span style="background:#${color.toString(16).padStart(6, '0')}"></span>`).join('');
  const thresholds = mode === 'velocity'
    ? [.2, .35, .5, .7, .9, 1.2, 1.5, 2, 2.8, 4, 6, 8]
    : mode === 'curl'
      ? [.05, .1, .2, .35, .5, .75, 1, 1.5, 2, 2.5, 3, 4]
      : [-1.5, -1, -.6, -.3, -.15, -.05, .05, .15, .3, .6, 1, 1.5];
  $('legendMin').textContent = mode === 'fixed' ? 'fixed' : mode === 'divergence' ? `≤${(thresholds[0] * scale).toFixed(2)}` : '0';
  $('legendMax').textContent = mode === 'fixed' ? '' : `≥${(thresholds[thresholds.length - 1] * scale).toFixed(2)}`;
}
let meshes = [];
let alphaAttributes = [];
let borderMesh = null;
let borderMatrices = null;
let borderAlphas = null;
let trailMesh = null;
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
function makeTrailMaterial() {
  const material = new THREE.LineBasicMaterial({ color: 0x6abfe8, transparent: true, opacity: 1, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float trailAlpha;\nvarying float vTrailAlpha;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrailAlpha = trailAlpha;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTrailAlpha;');
    shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vTrailAlpha );');
  };
  return material;
}
function rebuildTrails() {
  if (trailMesh) { scene.remove(trailMesh); trailMesh.geometry.dispose(); trailMesh.material.dispose(); }
  const segmentCount = simulation.items.length * (trailMaxPoints - 1);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  trailGeometry.setAttribute('trailAlpha', new THREE.BufferAttribute(new Float32Array(segmentCount * 2), 1));
  trailMesh = new THREE.LineSegments(trailGeometry, makeTrailMaterial());
  trailMesh.frustumCulled = false;
  trailMesh.visible = $('paths').checked;
  scene.add(trailMesh);
}
function updateTrails() {
  if (!trailMesh) return;
  const positions = trailMesh.geometry.attributes.position.array;
  const alphas = trailMesh.geometry.attributes.trailAlpha.array;
  const globalAlpha = +$('alpha').value;
  const trailLength = +$('trailLength').value;
  let positionOffset = 0;
  let alphaOffset = 0;
  for (const item of simulation.items) {
    const pathStart = Math.max(0, item.path.length - trailLength);
    const pathLength = item.path.length - pathStart;
    for (let point = 1; point < trailMaxPoints; point++) {
      const hasSegment = point < pathLength;
      const a = hasSegment ? item.path[pathStart + point - 1] : item.path[item.path.length - 1];
      const b = hasSegment ? item.path[pathStart + point] : a;
      positions[positionOffset++] = a.x; positions[positionOffset++] = a.y; positions[positionOffset++] = a.z;
      positions[positionOffset++] = b.x; positions[positionOffset++] = b.y; positions[positionOffset++] = b.z;
      const segmentAlpha = hasSegment ? item.opacity * globalAlpha * (.2 + .8 * point / (pathLength - 1)) : 0;
      alphas[alphaOffset++] = segmentAlpha; alphas[alphaOffset++] = segmentAlpha;
    }
  }
  trailMesh.geometry.attributes.position.needsUpdate = true;
  trailMesh.geometry.attributes.trailAlpha.needsUpdate = true;
  trailMesh.visible = $('paths').checked;
}
let simulation = new Simulation(250, fields.uniform); let running = true; let last = performance.now();
const $ = id => document.querySelector(`#${id}`); const fieldSelect = $('field');
for (const [key, field] of Object.entries(fields)) fieldSelect.add(new Option(field.name, key));

function rebuild() {
  simulation.setSeed(+$('seed').value);
  simulation.lifetimeMin = Math.min(+$('lifetimeMin').value, +$('lifetimeMax').value - 1);
  simulation.lifetimeMax = Math.max(+$('lifetimeMax').value, simulation.lifetimeMin + 1);
  simulation.fadeDuration = +$('fadeDuration').value;
  simulation.set(+$('count').value, fields[fieldSelect.value]);
  simulation.integrator = $('integrator').value;
  simulation.boundaryMode = $('boundary').value;
  for (const oldMesh of meshes) { scene.remove(oldMesh); oldMesh.geometry.dispose(); }
  meshes = [];
  alphaAttributes = [];
  if (borderMesh) { scene.remove(borderMesh); borderMesh.geometry.dispose(); borderMesh.material.dispose(); }
  const borderGeometry = new THREE.InstancedBufferGeometry();
  borderGeometry.copy(edgeGeometry);
  borderMatrices = new THREE.InstancedBufferAttribute(new Float32Array(simulation.items.length * 16), 16);
  borderAlphas = new THREE.InstancedBufferAttribute(new Float32Array(simulation.items.length), 1);
  borderGeometry.setAttribute('instanceMatrix', borderMatrices);
  borderGeometry.setAttribute('instanceAlpha', borderAlphas);
  borderGeometry.instanceCount = simulation.items.length;
  borderMesh = new THREE.LineSegments(borderGeometry, makeBorderMaterial());
  borderMesh.frustumCulled = false;
  borderMesh.renderOrder = 1;
  scene.add(borderMesh);
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
  rebuildTrails();
  updateArrows();
}
function updateLabels() { $('countValue').value = $('count').value; $('alphaValue').value = (+$('alpha').value).toFixed(2); $('fadeValue').value = `${(+$('fadeDuration').value).toFixed(1)}s`; $('lifetimeMinValue').value = `${$('lifetimeMin').value}s`; $('lifetimeMaxValue').value = `${$('lifetimeMax').value}s`; $('curlValue').value = (+$('curlStrength').value).toFixed(2); $('growthValue').value = (+$('growthRate').value).toFixed(2); $('dtValue').value = (+$('dt').value).toFixed(3); $('colorScaleValue').value = (+$('colorScale').value).toFixed(2); $('hysteresisValue').value = (+$('hysteresis').value).toFixed(2); $('trailLengthValue').value = $('trailLength').value; const growth = $('mode').value === 'divergence'; $('growthControl').style.display = growth ? 'block' : 'none'; $('curlControl').style.display = $('mode').value === 'particles' ? 'none' : 'block'; simulation.fadeDuration = +$('fadeDuration').value; simulation.integrator = $('integrator').value; simulation.boundaryMode = $('boundary').value; updateLegend(); }
function updateInfo() { const field = fields[fieldSelect.value]; $('fieldInfo').innerHTML = `<strong>${field.name}</strong><br><code>${field.equation}</code><br>${field.description}`; }
function syncUrl() { const params = new URLSearchParams({ field: fieldSelect.value, mode: $('mode').value, count: $('count').value, alpha: $('alpha').value, fade: $('fadeDuration').value, lmin: $('lifetimeMin').value, lmax: $('lifetimeMax').value, trail: $('trailLength').value, curl: $('curlStrength').value, growth: $('growthRate').value, dt: $('dt').value, color: $('colorMode').value, scale: $('colorScale').value, hyst: $('hysteresis').value, boundary: $('boundary').value, integrator: $('integrator').value, seed: $('seed').value, deform: $('deform').checked ? '1' : '0', vectors: $('vectors').checked ? '1' : '0', paths: $('paths').checked ? '1' : '0', cx: camera.position.x.toFixed(3), cy: camera.position.y.toFixed(3), cz: camera.position.z.toFixed(3), tx: controls.target.x.toFixed(3), ty: controls.target.y.toFixed(3), tz: controls.target.z.toFixed(3) }); history.replaceState(null, '', `${location.pathname}?${params}`); }
function loadUrl() { const p = new URLSearchParams(location.search); const set = (id, key = id) => { if (p.has(key)) $(id).value = p.get(key); }; set('field'); set('mode'); set('count'); set('alpha'); set('fadeDuration', 'fade'); set('lifetimeMin', 'lmin'); set('lifetimeMax', 'lmax'); set('trailLength', 'trail'); set('curlStrength', 'curl'); set('growthRate', 'growth'); set('dt'); set('colorMode', 'color'); set('colorScale', 'scale'); set('hysteresis', 'hyst'); set('boundary'); set('integrator'); set('seed'); if (p.has('deform')) $('deform').checked = p.get('deform') === '1'; if (p.has('vectors')) $('vectors').checked = p.get('vectors') === '1'; if (p.has('paths')) $('paths').checked = p.get('paths') === '1'; const cameraKeys = ['cx', 'cy', 'cz', 'tx', 'ty', 'tz']; const cameraValues = cameraKeys.map(key => Number(p.get(key))); const cameraPosition = new THREE.Vector3(cameraValues[0], cameraValues[1], cameraValues[2]); const cameraTarget = new THREE.Vector3(cameraValues[3], cameraValues[4], cameraValues[5]); if (cameraKeys.every(key => p.has(key)) && cameraValues.every(Number.isFinite) && cameraPosition.distanceTo(cameraTarget) > 0.1) { camera.position.copy(cameraPosition); controls.target.copy(cameraTarget); controls.update(); } }
function setCamera(name) { const views = { top: [0, 12, 0], front: [0, 0, 12], side: [12, 0, 0], iso: [8, 7, 10] }; camera.position.set(...views[name]); controls.target.set(0, 0, 0); controls.update(); }
function updateDiagnostics(event) { const rect = renderer.domElement.getBoundingClientRect(); const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, camera); const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) return; const field = fields[fieldSelect.value]; const velocity = field.velocity(hit); const { curl, divergence } = derivatives(field, hit); $('diagnostics').innerHTML = `<strong>Local field</strong><br>p = (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}, 0.00)<br>|v| = ${velocity.length().toFixed(3)}<br>curl = (${curl.x.toFixed(2)}, ${curl.y.toFixed(2)}, ${curl.z.toFixed(2)})<br>divergence = ${divergence.toFixed(3)}`; }
loadUrl(); updateLabels(); updateInfo(); rebuild(); syncUrl();
['count', 'alpha', 'fadeDuration', 'lifetimeMin', 'lifetimeMax', 'curlStrength', 'growthRate', 'dt', 'mode', 'trailLength', 'colorScale', 'hysteresis', 'integrator', 'boundary', 'deform', 'seed'].forEach(id => $(id).addEventListener('input', () => { updateLabels(); if (id === 'count' || id === 'seed' || id === 'lifetimeMin' || id === 'lifetimeMax') rebuild(); syncUrl(); }));
fieldSelect.addEventListener('change', () => { rebuild(); updateInfo(); syncUrl(); }); $('colorMode').addEventListener('change', () => { updateLegend(); syncUrl(); }); $('vectors').addEventListener('change', () => { arrows.visible = $('vectors').checked; syncUrl(); }); $('paths').addEventListener('change', () => { trailMesh.visible = $('paths').checked; syncUrl(); }); controls.addEventListener('change', syncUrl); $('panelToggle').addEventListener('click', () => { const hidden = document.querySelector('#app').classList.toggle('panel-hidden'); $('panelToggle').textContent = hidden ? 'Show controls' : 'Hide controls'; $('panelToggle').setAttribute('aria-expanded', String(!hidden)); }); $('reset').addEventListener('click', rebuild); $('pause').addEventListener('click', () => { running = !running; $('pause').textContent = running ? 'Pause' : 'Resume'; }); $('share').addEventListener('click', async () => { syncUrl(); await navigator.clipboard?.writeText(location.href); $('share').textContent = 'Link copied'; setTimeout(() => $('share').textContent = 'Copy share link', 1200); }); document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => setCamera(button.dataset.camera))); renderer.domElement.addEventListener('pointermove', updateDiagnostics);

const matrix = new THREE.Matrix4();
const deformationMatrix = new THREE.Matrix4();
const objectScale = new THREE.Vector3();
function bandFor(item) {
  const mode = $('colorMode').value;
  if (mode === 'fixed') return Math.floor(palette.length / 2);
  const scale = +$('colorScale').value;
  const hysteresis = +$('hysteresis').value;
  const thresholds = mode === 'velocity'
    ? [.2, .35, .5, .7, .9, 1.2, 1.5, 2, 2.8, 4, 6, 8].map(value => value * scale)
    : mode === 'curl'
      ? [.05, .1, .2, .35, .5, .75, 1, 1.5, 2, 2.5, 3, 4].map(value => value * scale)
      : [-1.5, -1, -.6, -.3, -.15, -.05, .05, .15, .3, .6, 1, 1.5].map(value => value * scale);
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
function animate(now) { requestAnimationFrame(animate); const realDt = Math.min((now - last) / 1000, .05); last = now; if (running) simulation.step(Math.min(realDt, +$('dt').value), realDt, $('mode').value, +$('curlStrength').value, +$('growthRate').value, $('deform').checked); const groupIndices = Array(palette.length).fill(0); for (let i = 0; i < simulation.items.length; i++) { const item = simulation.items[i]; const group = bandFor(item); const localIndex = groupIndices[group]++; matrix.makeRotationFromQuaternion(item.quaternion); deformationMatrix.setFromMatrix3(item.deformation); matrix.multiply(deformationMatrix); objectScale.set(item.size, item.size, item.size); matrix.scale(objectScale); matrix.setPosition(item.position); meshes[group].setMatrixAt(localIndex, matrix); alphaAttributes[group].setX(localIndex, item.opacity * +$('alpha').value); matrix.toArray(borderMatrices.array, i * 16); borderAlphas.setX(i, item.opacity * +$('alpha').value); } for (let group = 0; group < palette.length; group++) { meshes[group].count = groupIndices[group]; meshes[group].instanceMatrix.needsUpdate = true; alphaAttributes[group].needsUpdate = true; } borderMatrices.needsUpdate = true; borderAlphas.needsUpdate = true; const mode = $('mode').value; borderMesh.visible = mode === 'curl' || (mode === 'divergence' && $('deform').checked); updateTrails(); controls.update(); renderer.render(scene, camera); }
requestAnimationFrame(animate);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

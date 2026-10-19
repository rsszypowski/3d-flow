import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fields } from './fields.js';
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
const material = new THREE.MeshStandardMaterial({ color: 0x58c7ff, roughness: .55, metalness: .1, transparent: true, depthWrite: false });
material.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;');
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;');
  shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );');
};
let mesh = new THREE.InstancedMesh(geometry, material, 1); scene.add(mesh);
let alphaAttribute = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
mesh.geometry.setAttribute('instanceAlpha', alphaAttribute);
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
let simulation = new Simulation(250, fields.uniform); let running = true; let last = performance.now();
const $ = id => document.querySelector(`#${id}`); const fieldSelect = $('field');
for (const [key, field] of Object.entries(fields)) fieldSelect.add(new Option(field.name, key));

function rebuild() { simulation.set(+$('count').value, fields[fieldSelect.value]); simulation.fadeDuration = +$('fadeDuration').value; scene.remove(mesh); mesh = new THREE.InstancedMesh(geometry, material, simulation.items.length); alphaAttribute = new THREE.InstancedBufferAttribute(new Float32Array(simulation.items.length), 1); mesh.geometry.setAttribute('instanceAlpha', alphaAttribute); scene.add(mesh); updateArrows(); }
function updateLabels() { $('countValue').value = $('count').value; $('alphaValue').value = (+$('alpha').value).toFixed(2); $('fadeValue').value = `${(+$('fadeDuration').value).toFixed(1)}s`; $('curlValue').value = (+$('curlStrength').value).toFixed(2); $('growthValue').value = (+$('growthRate').value).toFixed(2); $('dtValue').value = (+$('dt').value).toFixed(3); const growth = $('mode').value === 'divergence'; $('growthControl').style.display = growth ? 'block' : 'none'; $('curlControl').style.display = $('mode').value === 'particles' ? 'none' : 'block'; simulation.fadeDuration = +$('fadeDuration').value; }
['count', 'alpha', 'fadeDuration', 'curlStrength', 'growthRate', 'dt', 'mode'].forEach(id => $(id).addEventListener('input', () => { updateLabels(); if (id === 'count') rebuild(); }));
fieldSelect.addEventListener('change', rebuild); $('vectors').addEventListener('change', () => { arrows.visible = $('vectors').checked; }); $('reset').addEventListener('click', rebuild); $('pause').addEventListener('click', () => { running = !running; $('pause').textContent = running ? 'Pause' : 'Resume'; }); updateLabels(); rebuild();

const matrix = new THREE.Matrix4();
function animate(now) { requestAnimationFrame(animate); const dt = Math.min((now - last) / 1000, .05); last = now; if (running) simulation.step(Math.min(dt, +$('dt').value), $('mode').value, +$('curlStrength').value, +$('growthRate').value); for (let i = 0; i < simulation.items.length; i++) { const item = simulation.items[i]; matrix.compose(item.position, item.quaternion, new THREE.Vector3(item.size, item.size, item.size)); mesh.setMatrixAt(i, matrix); alphaAttribute.setX(i, item.opacity * +$('alpha').value); } mesh.instanceMatrix.needsUpdate = true; alphaAttribute.needsUpdate = true; controls.update(); renderer.render(scene, camera); }
requestAnimationFrame(animate);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

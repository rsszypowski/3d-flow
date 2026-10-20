import * as THREE from 'three';
import { derivatives } from './fields.js';

const bounds = 5;
const baseSize = 0.08;
export const trailMaxPoints = 120;
const trailSpacing = 0.12;

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Simulation {
  constructor(count, field, options = {}) {
    this.fadeDuration = 1.5; this.lifetimeMin = 8; this.lifetimeMax = 18; this.boundaryMode = 'fade'; this.integrator = 'rk4'; this.deformationRate = 0.35;
    this.seed = options.seed ?? 12345; this.random = mulberry32(this.seed); this.set(count, field);
  }
  setSeed(seed) { this.seed = Number.isFinite(seed) ? seed : 12345; this.random = mulberry32(this.seed); }
  set(count, field) { this.field = field; this.items = Array.from({ length: count }, () => this.makeItem()); }
  randomBetween(min, max) { return min + (max - min) * this.random(); }
  makeItem() {
    const lifetime = this.randomBetween(this.lifetimeMin, this.lifetimeMax); const age = 0;
    const position = new THREE.Vector3(this.randomBetween(-bounds, bounds), this.randomBetween(-bounds, bounds), this.randomBetween(-bounds, bounds));
    return { position, quaternion: new THREE.Quaternion(), size: baseSize, scale: new THREE.Vector3(1, 1, 1), age, lifetime, fadeInElapsed: 0, opacity: 0, fadingOut: false, fadeRemaining: 0, velocity: new THREE.Vector3(), curl: new THREE.Vector3(), divergence: 0, band: 2, path: [position.clone()] };
  }
  velocityAt(position) { return this.field.velocity(position); }
  integrateEuler(position, dt) { position.addScaledVector(this.velocityAt(position), dt); }
  integrateRk4(position, dt) {
    const k1 = this.velocityAt(position); const p2 = position.clone().addScaledVector(k1, dt / 2); const k2 = this.velocityAt(p2); const p3 = position.clone().addScaledVector(k2, dt / 2); const k3 = this.velocityAt(p3); const p4 = position.clone().addScaledVector(k3, dt); const k4 = this.velocityAt(p4);
    position.addScaledVector(k1, dt / 6).addScaledVector(k2, dt / 3).addScaledVector(k3, dt / 3).addScaledVector(k4, dt / 6);
  }
  applyBoundary(item) {
    const limit = bounds * 1.7; const inside = ['x', 'y', 'z'].every(axis => item.position[axis] >= -limit && item.position[axis] <= limit); if (inside) return;
    if (this.boundaryMode === 'wrap') { for (const axis of ['x', 'y', 'z']) { if (item.position[axis] > limit) item.position[axis] = -limit; if (item.position[axis] < -limit) item.position[axis] = limit; } item.path = [item.position.clone()]; return; }
    if (this.boundaryMode === 'reflect') { for (const axis of ['x', 'y', 'z']) item.position[axis] = THREE.MathUtils.clamp(item.position[axis], -limit, limit); return; }
    if (this.boundaryMode === 'respawn') Object.assign(item, this.makeItem()); else if (!item.fadingOut) { item.fadingOut = true; item.fadeRemaining = this.fadeDuration; }
  }
  recordPath(item) {
    const lastPoint = item.path[item.path.length - 1];
    if (item.position.distanceTo(lastPoint) >= trailSpacing) {
      item.path.push(item.position.clone());
      if (item.path.length > trailMaxPoints) item.path.shift();
    }
  }
  step(dt, realDt, mode, curlStrength, growthRate, deform = false) {
    for (const item of this.items) {
      if (!item.fadingOut) {
        item.age += dt;
        item.fadeInElapsed = Math.min(this.fadeDuration, item.fadeInElapsed + realDt);
        item.opacity = this.fadeDuration > 0 ? item.fadeInElapsed / this.fadeDuration : 1;
      } else {
        item.fadeRemaining -= realDt;
        item.opacity = Math.max(0, item.fadeRemaining / this.fadeDuration);
      }
      if (this.integrator === 'rk4') this.integrateRk4(item.position, dt); else this.integrateEuler(item.position, dt);
      const { curl, divergence, jacobian } = derivatives(this.field, item.position); item.velocity.copy(this.velocityAt(item.position)); item.curl.copy(curl); item.divergence = divergence;
      if (mode !== 'particles' && (mode === 'curl' || mode === 'divergence')) { const angularVelocity = curl.multiplyScalar(curlStrength * dt); const angle = angularVelocity.length(); if (angle > 1e-8) item.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(angularVelocity.normalize(), angle)); }
      if (mode === 'divergence') item.size *= Math.exp(growthRate * divergence * dt);
      if (deform) { item.scale.x = THREE.MathUtils.clamp(item.scale.x * Math.exp(this.deformationRate * jacobian[0][0] * dt), .35, 3); item.scale.y = THREE.MathUtils.clamp(item.scale.y * Math.exp(this.deformationRate * jacobian[1][1] * dt), .35, 3); item.scale.z = THREE.MathUtils.clamp(item.scale.z * Math.exp(this.deformationRate * jacobian[2][2] * dt), .35, 3); }
      if (item.fadingOut && item.fadeRemaining <= 0) Object.assign(item, this.makeItem()); else if (!item.fadingOut && (item.age >= item.lifetime || item.size > 1.2 || item.size < 0.01)) { item.fadingOut = true; item.fadeRemaining = this.fadeDuration; } else { this.applyBoundary(item); this.recordPath(item); }
    }
  }
}

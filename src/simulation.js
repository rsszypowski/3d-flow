import * as THREE from 'three';
import { derivatives } from './fields.js';

const bounds = 5;
const baseSize = 0.08;
const lifetime = 12;

export class Simulation {
  constructor(count, field) { this.fadeDuration = 1.5; this.set(count, field); }
  set(count, field) {
    this.field = field; this.items = Array.from({ length: count }, () => this.makeItem());
  }
  makeItem() {
    const age = Math.random() * lifetime;
    return { position: new THREE.Vector3((Math.random() * 2 - 1) * bounds, (Math.random() * 2 - 1) * bounds, (Math.random() * 2 - 1) * bounds), quaternion: new THREE.Quaternion(), size: baseSize, age, opacity: this.opacityForAge(age), fadingOut: false, fadeRemaining: 0, velocity: new THREE.Vector3(), curl: new THREE.Vector3(), divergence: 0 };
  }
  opacityForAge(age) {
    return Math.max(0, Math.min(1, age / this.fadeDuration, (lifetime - age) / this.fadeDuration));
  }
  step(dt, mode, curlStrength, growthRate) {
    for (const item of this.items) {
      if (!item.fadingOut) {
        item.age += dt;
        item.opacity = this.opacityForAge(item.age);
      } else {
        item.fadeRemaining -= dt;
        item.opacity = Math.max(0, item.fadeRemaining / this.fadeDuration);
      }
      const v = this.field.velocity(item.position);
      item.velocity.copy(v);
      item.position.addScaledVector(v, dt);
      if (mode !== 'particles') {
        const { curl, divergence } = derivatives(this.field, item.position);
        item.curl.copy(curl); item.divergence = divergence;
        if (mode === 'curl' || mode === 'divergence') {
          const angularVelocity = curl.multiplyScalar(curlStrength * dt);
          const angle = angularVelocity.length();
          if (angle > 1e-8) item.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(angularVelocity.normalize(), angle));
        }
        if (mode === 'divergence') item.size *= Math.exp(growthRate * divergence * dt);
      }
      if (item.fadingOut && item.fadeRemaining <= 0) {
        Object.assign(item, this.makeItem());
      } else if (!item.fadingOut && (item.age >= lifetime || item.position.length() > bounds * 1.7 || item.size > 1.2 || item.size < 0.01)) {
        item.fadingOut = true;
        item.fadeRemaining = this.fadeDuration;
      }
    }
  }
}

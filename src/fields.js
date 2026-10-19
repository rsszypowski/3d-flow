import * as THREE from 'three';

export const fields = {
  uniform: { name: 'Uniform flow', velocity: p => new THREE.Vector3(1, 0, 0) },
  vortex: { name: 'Solid-body vortex', velocity: p => new THREE.Vector3(-p.y, p.x, 0) },
  source: { name: 'Source / sink', velocity: p => { const r2 = p.lengthSq() + 0.35; return p.clone().multiplyScalar(1.5 / Math.sqrt(r2)); } },
  saddle: { name: 'Saddle', velocity: p => new THREE.Vector3(p.x, -p.y, 0) }
};

export function derivatives(field, p, h = 0.002) {
  const columns = [];
  for (const axis of ['x', 'y', 'z']) {
    const plus = p.clone(); const minus = p.clone();
    plus[axis] += h; minus[axis] -= h;
    columns.push(field.velocity(plus).sub(field.velocity(minus)).multiplyScalar(1 / (2 * h)));
  }
  const [dx, dy, dz] = columns;
  return {
    divergence: dx.x + dy.y + dz.z,
    curl: new THREE.Vector3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x)
  };
}

import * as THREE from 'three';

export const fields = {
  uniform: { name: 'Uniform flow', equation: 'v = (1, 0, 0)', description: 'Every point moves at the same speed and direction.' , velocity: p => new THREE.Vector3(1, 0, 0) },
  vortex: { name: 'Solid-body vortex', equation: 'v = (-y, x, 0)', description: 'Objects rotate around the z-axis with constant vorticity.' , velocity: p => new THREE.Vector3(-p.y, p.x, 0) },
  source: { name: 'Source / sink', equation: 'v = 1.5 p / sqrt(|p|² + 0.35)', description: 'Flow expands away from or contracts toward the origin.' , velocity: p => { const r2 = p.lengthSq() + 0.35; return p.clone().multiplyScalar(1.5 / Math.sqrt(r2)); } },
  saddle: { name: 'Saddle', equation: 'v = (x, -y, 0)', description: 'Expansion along one axis is balanced by contraction along another.' , velocity: p => new THREE.Vector3(p.x, -p.y, 0) },
  swirlingSource: { name: 'Swirling source / sink', equation: 'v = (-y, x, 0) + radial(p)', description: 'A vortex combined with spatially varying expansion and vertical flow.' , velocity: p => { const r2 = p.x * p.x + p.y * p.y + p.z * p.z + 1; const radial = 1.2 / r2; return new THREE.Vector3(-p.y + radial * p.x, p.x + radial * p.y, 0.35 * p.z / r2); } },
  cellular: { name: '3D cellular flow', equation: 'trigonometric cellular field', description: 'A fully three-dimensional field with spatially varying curl and divergence.' , velocity: p => new THREE.Vector3(Math.sin(p.y) + 0.45 * Math.sin(p.z) + 0.22 * p.x * Math.cos(p.z), Math.sin(p.z) + 0.45 * Math.sin(p.x) + 0.22 * p.y * Math.cos(p.x), Math.sin(p.x) + 0.45 * Math.sin(p.y) + 0.22 * p.z * Math.cos(p.y)) }
};

export function derivatives(field, p, h = 0.002) {
  const columns = [];
  for (const axis of ['x', 'y', 'z']) {
    const plus = p.clone(); const minus = p.clone();
    plus[axis] += h; minus[axis] -= h;
    columns.push(field.velocity(plus).sub(field.velocity(minus)).multiplyScalar(1 / (2 * h)));
  }
  const [dx, dy, dz] = columns;
  const jacobian = [[dx.x, dy.x, dz.x], [dx.y, dy.y, dz.y], [dx.z, dy.z, dz.z]];
  return {
    divergence: dx.x + dy.y + dz.z,
    curl: new THREE.Vector3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x),
    jacobian
  };
}

import * as THREE from 'three';

export const fields = {
  uniform: { name: 'Uniform flow', equation: 'v = (1, 0, 0)', description: 'Every point moves at the same speed and direction.' , velocity: p => new THREE.Vector3(1, 0, 0) },
  vortex: { name: 'Solid-body vortex', equation: 'v = (-y, x, 0)', description: 'Objects rotate around the z-axis with constant vorticity.' , velocity: p => new THREE.Vector3(-p.y, p.x, 0) },
  potentialVortex: {
    name: 'Potential vortex (curl-free spiral)',
    equation: 'v = (-y/r², x/r², 0),  r² = x² + y²',
    description: 'A spiral flow with zero curl everywhere except at its singular origin; circulation is not the same as bulk rotation.',
    singular: true,
    velocity: p => {
      const r2 = p.x * p.x + p.y * p.y;
      // The field is undefined at the origin. Returning zero keeps the
      // renderer from creating NaNs when a vector is sampled exactly there.
      return r2 === 0 ? new THREE.Vector3() : new THREE.Vector3(-p.y / r2, p.x / r2, 0);
    },
    derivatives: p => {
      const r2 = p.x * p.x + p.y * p.y;
      if (r2 === 0) return { divergence: 0, curl: new THREE.Vector3(), jacobian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
      const r4 = r2 * r2;
      const a = 2 * p.x * p.y / r4;
      const b = (p.y * p.y - p.x * p.x) / r4;
      return { divergence: 0, curl: new THREE.Vector3(), jacobian: [[a, b, 0], [b, -a, 0], [0, 0, 0]] };
    }
  },
  shear: {
    name: 'Pure shear',
    equation: 'v = (y, 0, 0)',
    description: 'A divergence-free shear flow with nonzero curl: objects deform and slide rather than moving as a rigid rotation.',
    velocity: p => new THREE.Vector3(p.y, 0, 0),
    derivatives: () => ({
      divergence: 0,
      curl: new THREE.Vector3(0, 0, -1),
      jacobian: [[0, 1, 0], [0, 0, 0], [0, 0, 0]]
    })
  },
  source: { name: 'Source / sink', equation: 'v = 1.5 p / sqrt(|p|² + 0.35)', description: 'Flow expands away from or contracts toward the origin.' , velocity: p => { const r2 = p.lengthSq() + 0.35; return p.clone().multiplyScalar(1.5 / Math.sqrt(r2)); } },
  saddle: { name: 'Saddle', equation: 'v = (x, -y, 0)', description: 'Expansion along one axis is balanced by contraction along another.' , velocity: p => new THREE.Vector3(p.x, -p.y, 0) },
  swirlingSource: { name: 'Swirling source / sink', equation: 'v = (-y, x, 0) + radial(p)', description: 'A vortex combined with spatially varying expansion and vertical flow.' , velocity: p => { const r2 = p.x * p.x + p.y * p.y + p.z * p.z + 1; const radial = 1.2 / r2; return new THREE.Vector3(-p.y + radial * p.x, p.x + radial * p.y, 0.35 * p.z / r2); } },
  cellular: { name: '3D cellular flow', equation: 'trigonometric cellular field', description: 'A fully three-dimensional field with spatially varying curl and divergence.' , velocity: p => new THREE.Vector3(Math.sin(p.y) + 0.45 * Math.sin(p.z) + 0.22 * p.x * Math.cos(p.z), Math.sin(p.z) + 0.45 * Math.sin(p.x) + 0.22 * p.y * Math.cos(p.x), Math.sin(p.x) + 0.45 * Math.sin(p.y) + 0.22 * p.z * Math.cos(p.y)) }
};

export function derivatives(field, p, h = 0.002) {
  if (field.derivatives) return field.derivatives(p);
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

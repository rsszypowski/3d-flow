# 3D Flow

An exploratory 3D vector-field visualizer for classroom demonstrations.

## Current scope

- Predefined, time-independent 3D fields including uniform flow, solid-body and potential vortices, pure shear, source/sink, saddle, and cellular flow.
- CPU integration for a modest number of objects.
- Particle, curl/orientation, and divergence/growth modes.
- Orbit, pan, and zoom camera controls.

## Local development

```bash
npm install
npm run dev
```

The first implementation intentionally keeps simulation separate from rendering so a future GPU backend can be added without changing the field and UI concepts.

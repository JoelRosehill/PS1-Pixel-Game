import * as THREE from 'three';
import type { Atmosphere } from '../render/Atmosphere';
import { SKY_COMMON_GLSL } from '../render/sky/SkyShader';

/**
 * Glowing stylised water (ref: turquoise castle moat). Unlit: bright caustic
 * lattice + sky reflection by Fresnel + a moon/sun glitter path. The compositor
 * quantises it into chunky pixel ripples.
 */
export function buildWater(atmosphere: Atmosphere, size: number, level = 0): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...atmosphere.sky, ...atmosphere.water },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_COMMON_GLSL}
      uniform vec3 uWaterDeep, uWaterShallow, uWaterGlow;
      uniform float uWaterGlowStrength;
      varying vec3 vWorld;

      float caustic(vec2 p, float t) {
        float n = vnoise3(vec3(p, t));
        return pow(1.0 - abs(n - 0.5) * 2.0, 7.0);
      }

      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        // Pixel-snap the surface so ripples read as chunky pixel art up close.
        vec2 ps = floor(p * 6.0) / 6.0;
        float c1 = caustic(ps * 0.32 + vec2(t * 0.05, 0.0), t * 0.35);
        float c2 = caustic(ps * 0.61 + vec2(0.0, -t * 0.07) + 9.0, t * 0.5);
        float lattice = max(c1, c2 * 0.8);
        float body = vnoise3(vec3(ps * 0.08, t * 0.05));

        vec3 nrm = normalize(vec3((c1 - c2) * 0.18, 1.0, (c2 - body) * 0.18));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, nrm);
        float fres = pow(1.0 - max(dot(V, nrm), 0.0), 4.0);

        vec3 col = mix(uWaterDeep, uWaterShallow, smoothstep(0.25, 0.8, body) * 0.7 + lattice * 0.3);
        col += uWaterGlow * pow(lattice, 2.0) * uWaterGlowStrength;
        col = mix(col, skyHaze(R), clamp(fres * 0.85, 0.0, 0.85));

        float moonSpec = pow(max(dot(R, uMoonDir), 0.0), 90.0) * uMoonGlow;
        float sunSpec = pow(max(dot(R, uSunDir), 0.0), 140.0) * uSunGlow;
        col += (uMoonGlowColor * moonSpec + uSunColor * sunSpec) * (0.6 + lattice * 3.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.name = 'water';
  mesh.receiveShadow = false;
  return mesh;
}

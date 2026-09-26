import * as THREE from 'three';

/** Uniforms shared by every animated material (wind sway etc.). */
export const sharedUniforms = {
  uWindTime: { value: 0 },
};

let gradientMap: THREE.DataTexture | null = null;

/** 4-step light ramp: gives lighting the banded look of hand-shaded pixel art. */
function toonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const steps = new Uint8Array([60, 130, 195, 255]);
    gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

/** Unlit glowing material (windows, crystals, embers). Its colour is HDR, so values above 1 glow. */
export function glow(color: number, intensity = 2): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c });
}

/**
 * Adds vertex wind sway. Displacement grows with local height (y), so
 * geometry must be authored with its base at y = 0.
 */
export function withWind<T extends THREE.Material>(material: T, amplitude = 0.1, speed = 1): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = sharedUniforms.uWindTime;
    shader.vertexShader =
      'uniform float uWindTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windOrigin = instanceMatrix[3].xyz;
        #else
          vec3 windOrigin = modelMatrix[3].xyz;
        #endif
        float windT = uWindTime * ${speed.toFixed(2)};
        float sway = sin(windT * 1.6 + windOrigin.x * 0.35 + windOrigin.z * 0.27)
                   + 0.5 * sin(windT * 2.9 + windOrigin.x * 0.9 - windOrigin.z * 0.4);
        float windH = max(position.y, 0.0);
        transformed.x += sway * ${amplitude.toFixed(3)} * windH;
        transformed.z += sway * ${(amplitude * 0.6).toFixed(3)} * windH;
        `,
      );
  };
  material.customProgramCacheKey = () => `wind-${amplitude}-${speed}`;
  return material;
}

/**
 * Death dissolve: fragments vanish through a 4×4 Bayer pattern plus world-space noise as
 * `uniform.value` rises 0 → 1, so bodies break apart in chunky pixels rather than fading.
 * Each material keeps its own uniform; the shader program is shared.
 */
export function dissolvable<T extends THREE.Material>(material: T, uniform: { value: number }, edge = 0xffe0a0): T {
  const previous = material.onBeforeCompile;
  const edgeColor = new THREE.Color(edge);
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uDissolve = uniform;
    shader.vertexShader = 'varying vec3 vDissolvePos;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vDissolvePos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vDissolvePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`,
    );
    shader.fragmentShader = 'uniform float uDissolve;\nvarying vec3 vDissolvePos;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      if (uDissolve > 0.0) {
        vec3 cell = floor(vDissolvePos * 7.0);
        float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
        int i = p.x + p.y * 4;
        float bayer = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 :
          i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0;
        float k = n * 0.75 + bayer * 0.25;
        if (k < uDissolve) discard;
        if (k < uDissolve + 0.08) gl_FragColor.rgb = vec3(${edgeColor.r.toFixed(3)}, ${edgeColor.g.toFixed(3)}, ${edgeColor.b.toFixed(3)}) * 2.5;
      }`,
    );
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `dissolve-${edge}-${key ? key() : ''}`;
  return material;
}

/** Viewer position and hand-off radius shared by every range-clipped prop material. */
export const rangeUniforms = {
  uViewer: { value: new THREE.Vector3() },
  uHandoff: { value: 280 },
};

/**
 * Returns a copy of `material` that only draws fragments nearer than the hand-off
 * radius (`keep: 'near'`) or beyond it (`keep: 'far'`), measured in xz from the viewer.
 * Mid-range and long-range prop cells overlap spatially; this hands trees from one
 * to the other at exactly one distance so nothing is drawn twice.
 */
export function rangeClipped<T extends THREE.Material>(material: T, keep: 'near' | 'far'): T {
  const m = material.clone() as T;
  const previous = material.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    previous?.call(m, shader, renderer);
    shader.uniforms.uViewer = rangeUniforms.uViewer;
    shader.uniforms.uHandoff = rangeUniforms.uHandoff;
    shader.vertexShader = 'varying vec3 vRangePos;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vRangePos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vRangePos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif`,
    );
    shader.fragmentShader = 'uniform vec3 uViewer;\nuniform float uHandoff;\nvarying vec3 vRangePos;\n' +
      shader.fragmentShader.replace(
        'void main() {',
        `void main() {
        float rangeD = distance(vRangePos.xz, uViewer.xz);
        if (rangeD ${keep === 'near' ? '>' : '<'} uHandoff) discard;`,
      );
  };
  const key = material.customProgramCacheKey?.bind(material);
  m.customProgramCacheKey = () => `range-${keep}-${key ? key() : ''}`;
  return m;
}

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

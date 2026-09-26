import * as THREE from 'three';
import { NEBULA_MASK_GLSL } from './SkyShader';

/**
 * The nebula is the most expensive sky layer (~30 noise octaves per pixel) but it
 * barely moves, so its *masks* (dust density + two hue weights) are baked once into
 * a cubemap. The sky pass colourises the masks every frame, so preset colour blends
 * stay live, and slowly rotates the lookup for drift.
 */
export class NebulaCache {
  readonly target: THREE.WebGLCubeRenderTarget;
  private readonly camera: THREE.CubeCamera;
  private readonly scene = new THREE.Scene();

  constructor(size = 256) {
    this.target = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.UnsignedByteType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.camera = new THREE.CubeCamera(0.1, 10, this.target);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNebulaAxis: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uNebulaAxis;
        varying vec3 vDir;
        ${NEBULA_MASK_GLSL}
        void main() { gl_FragColor = vec4(nebulaMask(normalize(vDir)), 1.0); }
      `,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat));
  }

  bake(renderer: THREE.WebGLRenderer): void {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    this.camera.update(renderer, this.scene);
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }

  get texture(): THREE.CubeTexture {
    return this.target.texture;
  }
}

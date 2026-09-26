import * as THREE from 'three';
import type { Atmosphere } from './Atmosphere';
import { NebulaCache } from './sky/NebulaCache';
import { SKY_COMMON_GLSL, VIEW_DIR_GLSL } from './sky/SkyShader';

/**
 * SMART-PIXEL DEPTH RENDERER (Pillar 1)
 * ------------------------------------
 * The view frustum is sliced into depth bands. Each band is rasterised into its
 * own render target at its own pixel scale (near = crisp, far = chunky), so geometry
 * gets true low-res aliasing instead of a blurred downscale. The compositor then:
 *   1. walks the bands front-to-back (premultiplied "over"),
 *   2. ordered-dithers each band into the next across an overlap zone,
 *   3. draws 1-pixel silhouette outlines in near bands,
 *   4. fogs every pixel toward the sky haze in that pixel's direction,
 *   5. tonemaps and quantises to a limited palette with Bayer dithering.
 */

export interface PixelBandSpec {
  /** Far edge of the band in metres. Infinity = camera far plane. */
  far: number;
  /** Pixel size in base pixels (1 base pixel ≈ screenHeight / baseLines). */
  scale: number;
  /** Draw pixel-art silhouette outlines in this band. */
  outline?: boolean;
}

export interface PixelMode {
  id: string;
  name: string;
  bands: PixelBandSpec[];
  skyScale: number;
  /** Ignore base-pixel scaling: render at device resolution. */
  native?: boolean;
  quantize?: boolean;
}

export const PIXEL_MODES: PixelMode[] = [
  {
    id: 'smart',
    name: 'Smart-Pixel',
    skyScale: 3,
    quantize: true,
    bands: [
      { far: 16, scale: 1, outline: true },
      { far: 40, scale: 2, outline: true },
      { far: 100, scale: 3 },
      { far: 240, scale: 5 },
      { far: 650, scale: 8 },
      { far: Infinity, scale: 12 },
    ],
  },
  {
    id: 'flat',
    name: 'Flat HD (comparison)',
    skyScale: 1,
    native: true,
    quantize: false,
    bands: [{ far: 60, scale: 1 }, { far: Infinity, scale: 1 }],
  },
  {
    id: 'global',
    name: 'Global pixel filter (what we avoid)',
    skyScale: 4,
    quantize: true,
    bands: [{ far: 60, scale: 4, outline: true }, { far: Infinity, scale: 4 }],
  },
];

/*
 * Coordinate spaces: everything is laid out on a "base canvas" of baseW × baseH base
 * pixels (1 base px = basePx device px). Band and sky grids are integer multiples of
 * the base pixel, so the compositor runs at base resolution and a final nearest-
 * neighbour blit scales it to the screen (4× fewer shaded pixels at 1080p).
 */
interface Band {
  spec: PixelBandSpec;
  /** Base pixels per band pixel. */
  scale: number;
  /** Device pixels per band pixel (for display). */
  px: number;
  near: number;
  far: number;
  fadeStart: number;
  target: THREE.WebGLRenderTarget;
  /** Extra base pixels covered on the left / bottom / top so the band grid tiles the canvas. */
  extraLeft: number;
  extraBottom: number;
  extraTop: number;
  coverW: number;
  coverH: number;
}

const BAND_DEBUG_COLORS = [0x3cff8a, 0x3cc8ff, 0xb07cff, 0xff5ad2, 0xffb03c, 0xff3c3c, 0xffffff];

export interface SmartPixelSettings {
  /** Vertical resolution in base pixels. 540 → 2 device px per base px at 1080p. */
  baseLines: number;
  outline: number;
  quantLevels: number;
  dither: number;
  saturation: number;
  /** Fraction of each band's depth used for the dithered hand-off. */
  fadeFraction: number;
  debugBands: boolean;
}

export class SmartPixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly settings: SmartPixelSettings = {
    baseLines: 540,
    outline: 1,
    quantLevels: 28,
    dither: 1,
    saturation: 1.12,
    fadeFraction: 0.22,
    debugBands: false,
  };

  mode: PixelMode = PIXEL_MODES[0];
  /** Device (drawing-buffer) size. */
  width = 1;
  height = 1;
  /** Device pixels per base pixel. */
  basePx = 1;
  /** Base canvas size in base pixels. */
  baseW = 1;
  baseH = 1;

  private bands: Band[] = [];
  private skyTarget: THREE.WebGLRenderTarget | null = null;
  private compositeTarget: THREE.WebGLRenderTarget | null = null;
  private skyScale = 1;
  private skyExtra = new THREE.Vector2();
  private readonly bandCam = new THREE.PerspectiveCamera();
  private readonly fsScene = new THREE.Scene();
  private readonly fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fsQuad: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly blitMaterial: THREE.ShaderMaterial;
  private compositeMaterial!: THREE.ShaderMaterial;
  private readonly nebula = new NebulaCache();
  private readonly invProj = new THREE.Matrix4();
  private readonly camRot = new THREE.Matrix3();

  constructor(container: HTMLElement, private readonly atmosphere: Atmosphere) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.skyMaterial = this.createSkyMaterial();
    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uBlit: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc;
        uniform vec3 uBlit; // device px per base px, crop offset x, y
        void main() {
          ivec2 p = ivec2(floor((gl_FragCoord.xy + uBlit.yz) / uBlit.x));
          gl_FragColor = texelFetch(tSrc, clamp(p, ivec2(0), textureSize(tSrc, 0) - 1), 0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new THREE.Mesh(tri, this.skyMaterial);
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);

    this.nebula.bake(this.renderer);
    this.atmosphere.sky.uNebulaCube.value = this.nebula.texture;

    this.setMode(this.mode);
  }

  get bandInfo(): ReadonlyArray<{ near: number; far: number; px: number }> {
    return this.bands;
  }

  setMode(mode: PixelMode): void {
    this.mode = mode;
    this.compositeMaterial?.dispose();
    this.compositeMaterial = this.createCompositeMaterial(mode.bands);
    this.resize();
  }

  cycleBaseLines(dir: number): void {
    const options = [270, 360, 450, 540, 720];
    const i = options.indexOf(this.settings.baseLines);
    this.settings.baseLines = options[(i + dir + options.length) % options.length];
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = size.x;
    this.height = size.y;
    this.basePx = this.mode.native ? 1 : Math.max(1, Math.round(this.height / this.settings.baseLines));
    this.baseW = Math.ceil(this.width / this.basePx);
    this.baseH = Math.ceil(this.height / this.basePx);

    for (const b of this.bands) b.target.dispose();
    this.skyTarget?.dispose();
    this.compositeTarget?.dispose();

    this.bands = this.mode.bands.map((spec) => {
      const scale = this.mode.native ? 1 : Math.max(1, Math.round(spec.scale));
      const tw = Math.ceil(this.baseW / scale);
      const th = Math.ceil(this.baseH / scale);
      const coverW = tw * scale;
      const coverH = th * scale;
      const extraLeft = Math.floor((coverW - this.baseW) / 2);
      const extraBottom = Math.floor((coverH - this.baseH) / 2);
      const target = new THREE.WebGLRenderTarget(tw, th, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        depthTexture: new THREE.DepthTexture(tw, th, THREE.UnsignedIntType),
      });
      return {
        spec, scale, px: scale * this.basePx, near: 0, far: 0, fadeStart: 0, target,
        extraLeft, extraBottom, extraTop: coverH - this.baseH - extraBottom, coverW, coverH,
      };
    });

    this.skyScale = this.mode.native ? 1 : Math.max(1, Math.round(this.mode.skyScale));
    const sw = Math.ceil(this.baseW / this.skyScale);
    const sh = Math.ceil(this.baseH / this.skyScale);
    this.skyExtra.set(
      Math.floor((sw * this.skyScale - this.baseW) / 2),
      Math.floor((sh * this.skyScale - this.baseH) / 2),
    );
    this.skyTarget = new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    // Final LDR image at base resolution (already tonemapped + quantised, sRGB-encoded).
    this.compositeTarget = new THREE.WebGLRenderTarget(this.baseW, this.baseH, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });

    const cu = this.compositeMaterial.uniforms;
    this.bands.forEach((b, i) => {
      cu[`tColor${i}`].value = b.target.texture;
      cu[`tDepth${i}`].value = b.target.depthTexture;
      cu[`uGrid${i}`].value.set(b.scale, b.extraLeft, b.extraBottom, 0);
    });
    cu.tSky.value = this.skyTarget.texture;
    cu.uSkyGrid.value.set(this.skyScale, this.skyExtra.x, this.skyExtra.y, 0);

    const bu = this.blitMaterial.uniforms;
    bu.tSrc.value = this.compositeTarget.texture;
    bu.uBlit.value.set(
      this.basePx,
      Math.floor((this.baseW * this.basePx - this.width) / 2),
      Math.floor((this.baseH * this.basePx - this.height) / 2),
    );
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, view?: { scene: THREE.Scene; camera: THREE.PerspectiveCamera }): void {
    const r = this.renderer;
    r.info.reset();
    const W = this.baseW;
    const H = this.baseH;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();

    this.invProj.copy(camera.projectionMatrix).invert();
    this.camRot.setFromMatrix4(camera.matrixWorld);
    this.atmosphere.sky.uSkyPixelAngle.value = ((camera.fov * Math.PI) / 180 / H) * this.skyScale;

    // --- band depth ranges (each band overlaps the next by its fade zone)
    let prevFadeStart = camera.near;
    let prevFar = camera.near;
    this.bands.forEach((b, i) => {
      const last = i === this.bands.length - 1;
      b.near = i === 0 ? camera.near : prevFadeStart;
      b.far = last ? camera.far : Math.min(b.spec.far, camera.far);
      const fade = last ? 0 : (b.far - prevFar) * this.settings.fadeFraction;
      b.fadeStart = b.far - fade;
      prevFadeStart = b.fadeStart;
      prevFar = b.far;
    });

    // --- sky pass
    const su = this.skyMaterial.uniforms;
    su.uInvProj.value.copy(this.invProj);
    su.uCamRot.value.copy(this.camRot);
    su.uResolution.value.set(W, H);
    su.uGrid.value.set(this.skyScale, this.skyExtra.x, this.skyExtra.y, 0);
    this.fsQuad.material = this.skyMaterial;
    r.setRenderTarget(this.skyTarget);
    r.render(this.fsScene, this.fsCam);

    // --- depth bands (shadow map rendered once, on the first band)
    r.shadowMap.needsUpdate = true;
    const cam = this.bandCam;
    cam.matrixAutoUpdate = false;
    cam.matrixWorldAutoUpdate = false;
    cam.matrixWorld.copy(camera.matrixWorld);
    cam.matrixWorldInverse.copy(camera.matrixWorldInverse);
    cam.fov = camera.fov;
    cam.zoom = camera.zoom;
    cam.aspect = W / H;
    cam.layers.mask = camera.layers.mask;
    for (let i = this.bands.length - 1; i >= 0; i--) {
      const b = this.bands[i];
      cam.near = b.near;
      cam.far = b.far;
      cam.setViewOffset(W, H, -b.extraLeft, -b.extraTop, b.coverW, b.coverH);
      r.setRenderTarget(b.target);
      r.clear(true, true, false);
      r.render(scene, cam);
    }

    // --- composite at base resolution
    const cu = this.compositeMaterial.uniforms;
    this.bands.forEach((b, i) => {
      cu[`uBand${i}`].value.set(b.near, b.far, b.fadeStart, i === this.bands.length - 1 ? 1 : 0);
    });
    cu.uInvProj.value.copy(this.invProj);
    cu.uCamRot.value.copy(this.camRot);
    cu.uResolution.value.set(W, H);
    const fog = this.atmosphere.fog;
    cu.uFogDensity.value = fog.density;
    cu.uFogStart.value = fog.start;
    cu.uFogMax.value = fog.max;
    cu.uFogFalloff.value = fog.falloff;
    cu.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(cu.uCamFwd.value);
    cu.uExposure.value = this.atmosphere.exposure;
    cu.uOutline.value = this.settings.outline;
    cu.uQuantLevels.value = this.mode.quantize ? this.settings.quantLevels : 0;
    cu.uDither.value = this.settings.dither;
    cu.uSaturation.value = this.settings.saturation;
    cu.uDebugBands.value = this.settings.debugBands ? 1 : 0;
    this.fsQuad.material = this.compositeMaterial;
    r.setRenderTarget(this.compositeTarget);
    r.render(this.fsScene, this.fsCam);

    // Hands and equipment use the same crisp base-pixel grid, but their own depth
    // buffer. They cannot disappear inside nearby scenery or enter distant bands.
    if (view && view.scene.visible) {
      view.camera.aspect = W / H;
      view.camera.updateProjectionMatrix();
      r.clearDepth();
      r.render(view.scene, view.camera);
    }

    // --- nearest-neighbour upscale to the screen
    this.fsQuad.material = this.blitMaterial;
    r.setRenderTarget(null);
    r.render(this.fsScene, this.fsCam);
  }

  dispose(): void {
    for (const b of this.bands) b.target.dispose();
    this.skyTarget?.dispose();
    this.compositeTarget?.dispose();
    this.nebula.target.dispose();
    this.skyMaterial.dispose();
    this.blitMaterial.dispose();
    this.compositeMaterial.dispose();
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------------

  private createSkyMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.atmosphere.sky,
        uInvProj: { value: new THREE.Matrix4() },
        uCamRot: { value: new THREE.Matrix3() },
        uResolution: { value: new THREE.Vector2() },
        uGrid: { value: new THREE.Vector4(1, 0, 0, 0) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${SKY_COMMON_GLSL}
        ${VIEW_DIR_GLSL}
        uniform vec4 uGrid;
        void main() {
          vec2 center = (floor(gl_FragCoord.xy) + 0.5) * uGrid.x - uGrid.yz;
          gl_FragColor = vec4(skyFull(viewDirFromScreen(center)), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
  }

  private createCompositeMaterial(specs: PixelBandSpec[]): THREE.ShaderMaterial {
    const uniforms: Record<string, THREE.IUniform> = {
      ...this.atmosphere.sky,
      uInvProj: { value: new THREE.Matrix4() },
      uCamRot: { value: new THREE.Matrix3() },
      uResolution: { value: new THREE.Vector2() },
      tSky: { value: null },
      uSkyGrid: { value: new THREE.Vector4(1, 0, 0, 0) },
      uFogDensity: { value: 0.002 },
      uFogStart: { value: 30 },
      uFogMax: { value: 0.9 },
      uFogFalloff: { value: 50 },
      uCamPos: { value: new THREE.Vector3() },
      uCamFwd: { value: new THREE.Vector3() },
      uExposure: { value: 1 },
      uOutline: { value: 1 },
      uOutlineTint: { value: new THREE.Color(0x1a0830) },
      uQuantLevels: { value: 28 },
      uDither: { value: 1 },
      uSaturation: { value: 1.1 },
      uDebugBands: { value: 0 },
    };
    let decl = '';
    let body = '';
    specs.forEach((s, i) => {
      uniforms[`tColor${i}`] = { value: null };
      uniforms[`tDepth${i}`] = { value: null };
      uniforms[`uBand${i}`] = { value: new THREE.Vector4() };
      uniforms[`uGrid${i}`] = { value: new THREE.Vector4(1, 0, 0, 0) };
      const dbg = new THREE.Color(BAND_DEBUG_COLORS[i % BAND_DEBUG_COLORS.length]);
      decl += `uniform sampler2D tColor${i}; uniform sampler2D tDepth${i}; uniform vec4 uBand${i}; uniform vec4 uGrid${i};\n`;
      body += /* glsl */ `
      if (T > 0.003) {
        ivec2 gp; float z;
        vec4 c = sampleBand(tColor${i}, tDepth${i}, uBand${i}, uGrid${i}, ${s.outline ? 'true' : 'false'}, gp, z);
        if (c.a > 0.0) {
          if (uDebugBands > 0.5) c.rgb = mix(c.rgb, vec3(${dbg.r.toFixed(3)}, ${dbg.g.toFixed(3)}, ${dbg.b.toFixed(3)}) * c.a, 0.45);
          if (!hit) { grid = gp; hit = true; }
          acc += T * c.rgb;
          T *= 1.0 - c.a;
        }
      }`;
    });

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */ `
        ${SKY_COMMON_GLSL}
        ${VIEW_DIR_GLSL}
        ${decl}
        uniform sampler2D tSky; uniform vec4 uSkyGrid;
        uniform float uFogDensity, uFogStart, uFogMax, uFogFalloff, uExposure, uOutline, uQuantLevels, uDither, uSaturation, uDebugBands;
        uniform vec3 uOutlineTint, uCamPos, uCamFwd;

        // Exponential height fog integrated along the view ray: valleys fill with mist,
        // while peaks and spires stay readable against the sky.
        float heightFog(vec3 rd, float dist) {
          float t0 = min(uFogStart, dist);
          float oy = uCamPos.y + rd.y * t0;
          float t = dist - t0;
          float b = 1.0 / uFogFalloff;
          float a = uFogDensity * exp(-oy * b);
          float k = rd.y * b;
          float od = abs(k) > 1e-5 ? a * (1.0 - exp(-k * t)) / k : a * t;
          return min(1.0 - exp(-od), uFogMax);
        }

        const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        float bayer4(ivec2 p) { return (BAYER[(p.x & 3) + (p.y & 3) * 4] + 0.5) / 16.0; }

        float linearDepth(float d, float n, float f) { return n * f / (f - (f - n) * d); }

        vec4 sampleBand(sampler2D tc, sampler2D td, vec4 band, vec4 grid, bool outline, out ivec2 gp, out float z) {
          ivec2 size = textureSize(tc, 0);
          ivec2 p = clamp(ivec2(floor((gl_FragCoord.xy + grid.yz) / grid.x)), ivec2(0), size - 1);
          gp = p;
          z = 0.0;
          vec4 c = texelFetch(tc, p, 0);
          if (c.a <= 0.0) return vec4(0.0);
          z = linearDepth(texelFetch(td, p, 0).r, band.x, band.y);

          // Ordered-dither hand-off into the next (coarser) band.
          if (band.w < 0.5 && z > band.z) {
            float t = (z - band.z) / max(band.y - band.z, 1e-3);
            if (t > bayer4(p)) return vec4(0.0);
          }

          if (outline && uOutline > 0.0 && z < band.z) {
            float zn[4];
            ivec2 offs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
            for (int k = 0; k < 4; k++) {
              ivec2 q = clamp(p + offs[k], ivec2(0), size - 1);
              float a = texelFetch(tc, q, 0).a;
              // Empty neighbour = open sky or a farther band (but not a near-plane cut).
              zn[k] = a > 0.0 ? linearDepth(texelFetch(td, q, 0).r, band.x, band.y)
                              : (z > band.x * 1.15 + 0.5 ? 1e6 : z);
            }
            float thr = max(0.35, z * 0.05);
            float edge = 0.0;
            for (int k = 0; k < 4; k += 2) {
              float j1 = zn[k] - z;
              float j2 = zn[k + 1] - z;
              if (j1 > thr && j1 > 2.0 * abs(j2)) edge = 1.0;
              if (j2 > thr && j2 > 2.0 * abs(j1)) edge = 1.0;
            }
            c.rgb = mix(c.rgb, c.rgb * 0.2 + uOutlineTint * 0.02 * c.a, edge * uOutline);
          }

          // Aerial perspective: fade toward the sky haze in this pixel's direction.
          vec2 center = (vec2(p) + 0.5) * grid.x - grid.yz;
          vec3 dir = viewDirFromScreen(center);
          float fogF = heightFog(dir, z / max(dot(dir, uCamFwd), 0.05));
          c.rgb = mix(c.rgb, fogHaze(dir) * c.a, fogF);
          return c;
        }

        vec3 tonemap(vec3 c) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float lt = l * (1.0 + l / 9.0) / (1.0 + l);
          vec3 t = c * (lt / max(l, 1e-4));
          float m = max(t.r, max(t.g, t.b));
          if (m > 1.0) t = mix(t / m, vec3(1.0), clamp((m - 1.0) * 0.4, 0.0, 1.0));
          return t;
        }

        vec3 toSRGB(vec3 c) {
          c = clamp(c, 0.0, 1.0);
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        void main() {
          vec3 acc = vec3(0.0);
          float T = 1.0;
          ivec2 grid = ivec2(0);
          bool hit = false;
          ${body}
          if (T > 0.003) {
            ivec2 ss = textureSize(tSky, 0);
            ivec2 sp = clamp(ivec2(floor((gl_FragCoord.xy + uSkyGrid.yz) / uSkyGrid.x)), ivec2(0), ss - 1);
            vec3 sky = texelFetch(tSky, sp, 0).rgb;
            if (uDebugBands > 0.5) sky = mix(sky, vec3(0.1, 0.1, 0.25), 0.5);
            acc += T * sky;
            if (!hit) grid = sp;
          }

          vec3 col = tonemap(acc * uExposure);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(l), col, uSaturation), 0.0);
          col = toSRGB(col);
          if (uQuantLevels > 0.0) {
            float d = (bayer4(grid) - 0.5) * uDither;
            col = clamp(floor(col * uQuantLevels + 0.5 + d) / uQuantLevels, 0.0, 1.0);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
  }
}

const FULLSCREEN_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

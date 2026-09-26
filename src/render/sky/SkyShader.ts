import * as THREE from 'three';

/**
 * Sky uniforms are shared (by reference) between the sky pass, the compositor
 * (sky-matched fog) and any material that wants sky reflections (water).
 */
export function createSkyUniforms() {
  return {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color() },
    uMidSky: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },

    uMoonDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
    uMoonRadius: { value: 0.2 },
    uMoonColor: { value: new THREE.Color() },
    uMoonShadow: { value: new THREE.Color() },
    uMoonGlowColor: { value: new THREE.Color() },
    uMoonGlow: { value: 1 },

    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunSize: { value: 0 },
    uSunGlow: { value: 0 },

    uNebulaA: { value: new THREE.Color() },
    uNebulaB: { value: new THREE.Color() },
    uNebulaC: { value: new THREE.Color() },
    uNebulaStrength: { value: 1 },
    /** Baked nebula masks (see NebulaCache). */
    uNebulaCube: { value: null as THREE.Texture | null },

    uStarBrightness: { value: 1 },
    uCloudColor: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color() },
    uCloudCover: { value: 0.4 },

    /** Angular size of one sky pixel (radians); lets stars snap to whole pixels. */
    uSkyPixelAngle: { value: 0.005 },
  };
}

export type SkyUniforms = ReturnType<typeof createSkyUniforms>;

/** Hash + value noise shared by the sky shaders. */
export const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1, 0, 0));
  float c = hash13(i + vec3(0, 1, 0));
  float d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1));
  float g = hash13(i + vec3(1, 0, 1));
  float h = hash13(i + vec3(0, 1, 1));
  float k = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3Lite(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}
`;

/**
 * Nebula masks, baked once into a cubemap by NebulaCache (expects `uniform vec3 uNebulaAxis`).
 * Returns (dust density, hue weight B, hue weight C).
 */
export const NEBULA_MASK_GLSL = /* glsl */ `
${NOISE_GLSL}
vec3 nebulaMask(vec3 d) {
  // Dust concentrates in a galactic band, with scattered wisps elsewhere.
  float band = exp(-pow(dot(d, uNebulaAxis) * 2.4, 2.0));
  vec3 q = d * 2.2;
  vec3 warp = vec3(fbm3(q + 3.1), fbm3(q + 7.7), fbm3(q + 12.3));
  float n = fbm3(q * 1.6 + warp * 1.8);
  float dust = smoothstep(0.42, 0.78, n) * (0.35 + band * 1.1);
  float lanes = smoothstep(0.5, 0.62, fbm3(q * 4.0 + 5.0));   // dark lanes through the dust
  float hue = fbm3(q * 0.9 + 40.0);
  return vec3(clamp(dust * (1.0 - lanes * 0.6) / 1.45, 0.0, 1.0),
              smoothstep(0.35, 0.6, hue), smoothstep(0.58, 0.72, hue));
}
`;

/** GLSL shared by the sky pass and compositor: uniforms, noise, sky functions. */
export const SKY_COMMON_GLSL = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
uniform vec3 uZenith, uMidSky, uHorizon, uGround;
uniform vec3 uMoonDir; uniform float uMoonRadius;
uniform vec3 uMoonColor, uMoonShadow, uMoonGlowColor; uniform float uMoonGlow;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize, uSunGlow;
uniform vec3 uNebulaA, uNebulaB, uNebulaC; uniform float uNebulaStrength;
uniform samplerCube uNebulaCube;
uniform float uStarBrightness;
uniform vec3 uCloudColor, uCloudLit; uniform float uCloudCover;
uniform float uSkyPixelAngle;

vec3 skyGradient(vec3 d) {
  float h = d.y;
  vec3 c = mix(uHorizon, uMidSky, smoothstep(0.0, 0.28, h));
  c = mix(c, uZenith, smoothstep(0.25, 0.95, h));
  return mix(c, uGround, smoothstep(0.0, -0.25, h));
}

float angleTo(vec3 d, vec3 target) {
  return acos(clamp(dot(d, target), -1.0, 1.0));
}

/** Soft halos around moon and sun. */
vec3 skyGlow(vec3 d) {
  float a = max(angleTo(d, uMoonDir) - uMoonRadius, 0.0);
  vec3 g = uMoonGlowColor * uMoonGlow * (exp(-a * 2.6) * 0.55 + exp(-a * 11.0) * 0.9);
  float s = max(angleTo(d, uSunDir) - uSunSize, 0.0);
  g += uSunColor * uSunGlow * (exp(-s * 3.0) * 0.5 + exp(-s * 16.0) * 1.2);
  return g;
}

vec3 skyHaze(vec3 d) {
  return skyGradient(d) + skyGlow(d);
}

/** Fog colour: the sky haze with a dimmer halo, so silhouettes stay darker than the moon behind them. */
vec3 fogHaze(vec3 d) {
  return skyGradient(d) + skyGlow(d) * 0.4;
}

vec3 nebula(vec3 d) {
  if (uNebulaStrength <= 0.0) return vec3(0.0);
  float a = uTime * 0.002; // slow drift
  vec3 m = texture(uNebulaCube, vec3(d.x * cos(a) - d.z * sin(a), d.y, d.x * sin(a) + d.z * cos(a))).rgb;
  vec3 col = mix(uNebulaA, uNebulaB, m.g);
  col = mix(col, uNebulaC, m.b * 0.9);
  return col * m.r * 1.45 * uNebulaStrength;
}

vec3 starColor(float h) {
  if (h < 0.30) return vec3(0.85, 0.9, 1.0);
  if (h < 0.45) return vec3(1.0, 0.45, 0.75);   // pink
  if (h < 0.60) return vec3(0.4, 0.95, 1.0);    // cyan
  if (h < 0.72) return vec3(1.0, 0.85, 0.45);   // gold
  if (h < 0.84) return vec3(0.5, 1.0, 0.6);     // green
  return vec3(0.75, 0.55, 1.0);                 // violet
}

vec3 starLayer(vec3 d, float density, float prob, float coreR, float arm, float gain, float seed) {
  vec3 p = d * density;
  vec3 cell = floor(p);
  vec3 h = hash33(cell + seed);
  if (h.x > prob) return vec3(0.0);
  vec3 sp = cell + 0.5 + (hash33(cell + seed + 11.0) - 0.5) * 0.5;
  vec3 v = p - sp;
  v -= d * dot(v, d);
  vec3 t1 = normalize(cross(d, abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(d, t1);
  vec2 q = vec2(dot(v, t1), dot(v, t2)) / density / uSkyPixelAngle; // in sky pixels
  float r = max(abs(q.x), abs(q.y));
  float core = step(r, coreR);
  float spark = 0.0;
  if (arm > 0.0) {
    spark = step(abs(q.x), 0.5) * step(abs(q.y), coreR + arm)
          + step(abs(q.y), 0.5) * step(abs(q.x), coreR + arm);
    spark = min(spark, 1.0) * 0.55;
  }
  float tw = 0.65 + 0.35 * sin(uTime * (1.2 + h.y * 3.0) + h.z * 60.0);
  return starColor(h.y) * max(core, spark) * tw * gain;
}

vec3 stars(vec3 d) {
  if (uStarBrightness <= 0.0) return vec3(0.0);
  vec3 s = starLayer(d, 70.0, 0.12, 0.6, 0.0, 1.0, 0.0);
  s += starLayer(d, 26.0, 0.12, 0.9, 1.0, 2.2, 31.0);
  s += starLayer(d, 9.0, 0.10, 1.4, 2.6, 3.5, 77.0);
  return s * uStarBrightness;
}

vec4 moonDisc(vec3 d) {
  float a = angleTo(d, uMoonDir);
  if (a > uMoonRadius) return vec4(0.0);
  vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, uMoonDir);
  vec2 q = vec2(dot(d, right), dot(d, up)) / sin(uMoonRadius);
  float r2 = dot(q, q);
  if (r2 > 1.0) return vec4(0.0);
  vec3 n = vec3(q, sqrt(1.0 - r2));
  float maria = smoothstep(0.42, 0.62, fbm3(n * 2.4 + 4.0));
  float craters = fbm3(n * 8.0 + 1.0);
  // Crater rings: cellular pits with a bright rim. Centres stay in the middle half
  // of each cell, so checking the 2x2x2 cells around the sample covers every crater.
  vec3 cp = n * 5.0;
  vec3 ci = floor(cp - 0.5);
  float pit = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 c = ci + o;
    vec3 h = hash33(c + 5.0);
    if (h.x > 0.45) continue;
    vec3 center = c + 0.25 + h * 0.5;
    float rr = 0.18 + h.y * 0.17;
    float dd = length(cp - center) / rr;
    pit += (1.0 - smoothstep(0.7, 1.0, dd)) * 0.6 - (smoothstep(0.75, 0.95, dd) - smoothstep(0.95, 1.15, dd)) * 0.5;
  }
  float light = clamp(0.4 + 0.7 * dot(n, normalize(vec3(-0.35, 0.45, 0.8))), 0.0, 1.2);
  vec3 col = mix(uMoonColor, uMoonShadow, clamp(maria * 0.8 + pit * 0.5, 0.0, 1.0));
  col *= 0.7 + craters * 0.6;
  col *= light;
  col += uMoonGlowColor * pow(r2, 5.0) * 0.5; // hot rim
  return vec4(col, 1.0);
}

vec3 sunDisc(vec3 d) {
  if (uSunSize <= 0.0) return vec3(0.0);
  float a = angleTo(d, uSunDir);
  return uSunColor * step(a, uSunSize) * 6.0;
}

vec4 clouds(vec3 d) {
  if (uCloudCover <= 0.0 || d.y < -0.02) return vec4(0.0);
  vec3 q = vec3(d.x / (d.y + 0.16), 0.0, d.z / (d.y + 0.16)) * 0.8;
  q += vec3(uTime * 0.006, 0.0, uTime * 0.002);
  float n = fbm3(q * 1.3 + fbm3Lite(q * 0.7) * 0.8);
  float cover = smoothstep(1.0 - uCloudCover, 1.05 - uCloudCover + 0.18, n);
  cover *= smoothstep(-0.02, 0.08, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y) * 0.7);
  float lit = smoothstep(0.35, 0.9, n);
  float nearLight = exp(-max(angleTo(d, uMoonDir) - uMoonRadius, 0.0) * 3.0) * uMoonGlow
                  + exp(-max(angleTo(d, uSunDir) - uSunSize, 0.0) * 3.0) * uSunGlow;
  vec3 col = mix(uCloudColor, uCloudLit, lit * 0.8) + uMoonGlowColor * nearLight * 0.25;
  return vec4(col, cover);
}

vec3 skyFull(vec3 d) {
  vec3 col = skyGradient(d);
  float above = smoothstep(-0.02, 0.1, d.y);
  col += nebula(d) * above;
  col += stars(d) * above;
  vec4 m = moonDisc(d);
  col = mix(col, m.rgb, m.a);
  col += sunDisc(d);
  vec4 c = clouds(d);
  col = mix(col, c.rgb, c.a);
  col += skyGlow(d) * (1.0 - m.a * 0.7);
  return col;
}
`;

/** Converts a pixel's centre (in canvas pixels) into a world-space view direction. */
export const VIEW_DIR_GLSL = /* glsl */ `
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec2 uResolution;
vec3 viewDirFromScreen(vec2 screenPx) {
  vec2 ndc = screenPx / uResolution * 2.0 - 1.0;
  vec4 v = uInvProj * vec4(ndc, 1.0, 1.0);
  return normalize(uCamRot * (v.xyz / v.w));
}
`;

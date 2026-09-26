/**
 * Native bounds (m) of the models the Long Road places, from public/models/manifest.json
 * (regenerate with `node tools/model-bounds.mjs`). Structures need footprints before the
 * models load, so the ground under them can be levelled first.
 */
export const MODEL_BOUNDS: Record<string, [number, number, number]> = {
  'a-forest-3-with-a-road-at-night-for-game': [19.527, 2.85, 10.36],
  'castle-xiii': [5.925, 1.953, 3.227],
  'church-psx': [5.299, 4.367, 3.994],
  'classical-guitar-ps1-low-poly': [6.307, 16.521, 15.98],
  'free-modular-castle-kit': [53.5, 16.971, 141.095],
  'lowpoly-castle': [342.336, 44.946, 364.771],
  'ps1-italian-broadsword': [0.363, 0.036, 1.591],
  'ps1-medieval-long-sword': [1.052, 0.076, 5.054],
  'ps1-ottoman-war-axe': [12.725, 1.902, 75],
  'ps1-scimitar': [0.492, 0.152, 1.406],
  'ps1-style-creepy-forest-environment': [35.023, 21.852, 25.46],
  'ps1-style-low-poly-cpu': [2, 5.096, 3.627],
  'ps1-style-low-poly-sun': [48.761, 48.831, 48.761],
  'ps1-style-machete': [0.243, 1.222, 12.529],
  'ps1-style-old-keyboard': [4.733, 0.343, 6],
  'ps1-style-old-mouse': [2.285, 0.307, 0.426],
  'ps1-sword-b': [25, 3, 125],
  'ps1lowpoly-gravestone': [1.86, 2.362, 0.711],
  'psx-graveyard-modular-ps1-style-free': [5.202, 4.244, 20.422],
  'psx-hema-practice-sword': [0.288, 0.051, 1.672],
  'retro-lowpoly-crt-tv': [0.362, 0.361, 0.392],
  'simple-rock-ps1-low-poly': [2, 1.633, 2],
  'the-landscape-is-a-forest-in-the-mountains': [47.311, 13.039, 45.94],
  'the-lost-relic': [16.096, 12.686, 23.568],
  'wood-log-pile-ps1-low-poly': [4.393, 2.247, 0.862],
};

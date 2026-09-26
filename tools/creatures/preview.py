"""Renders a contact sheet of every clip in an exported creature GLB (for review).

    python tools/creatures/preview.py -- <creature-id> <out-dir> [frames-per-clip] [clip,clip]

Rows are clips, columns are evenly spaced moments through each clip; the camera looks
at the creature's front-left quarter. Needs Pillow for the sheet.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import forge  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]
cid, out = args[0], args[1]
per = int(args[2]) if len(args) > 2 else 5
only = set(args[3].split(',')) if len(args) > 3 else None
os.makedirs(out, exist_ok=True)

forge.reset()
bpy.ops.import_scene.gltf(filepath=os.path.join(forge.OUT, f'{cid}.glb'))
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
arm = forge.armature()
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.samples = 6
scn.cycles.device = 'CPU'
scn.render.resolution_x = scn.render.resolution_y = int(os.environ.get('RES', 220))
world = bpy.data.worlds.new('w')
scn.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.42, 0.4, 0.47, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
scn.collection.objects.link(sun)
sun.rotation_euler = (0.7, 0.2, 0.8)
sun.data.energy = 3
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scn.collection.objects.link(cam)
scn.camera = cam
cam.data.lens = 50
lo, hi = forge.evaluated_bounds()
size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (hi.z + lo.z) / 2))
a = math.radians(-35)
dist = size * float(os.environ.get('DIST', 1.9))
cam.location = center + Vector((math.sin(a) * dist, -math.cos(a) * dist, size * 0.25))
cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
# ground grid for scale
bpy.ops.mesh.primitive_plane_add(size=size * 3, location=(center.x, center.y, 0))

actions = sorted(bpy.data.actions, key=lambda x: x.name)
rows = []
def clip_name(action):
    # The importer appends the armature name: 'walk_<armature>'.
    suffix = '_' + arm.name
    return action.name[:-len(suffix)] if action.name.endswith(suffix) else action.name


for action in actions:
    if only and clip_name(action) not in only:
        continue
    arm.animation_data.action = action
    start, end = action.frame_range
    row = []
    for i in range(per):
        f = start + (end - start) * i / max(1, per - 1)
        scn.frame_set(int(round(f)))
        path = os.path.join(out, f'{cid}_{clip_name(action)}_{i}.png')
        scn.render.filepath = path
        bpy.ops.render.render(write_still=True)
        row.append(path)
    rows.append((clip_name(action), row))

try:
    from PIL import Image, ImageDraw
    W = int(os.environ.get('RES', 220))
    sheet = Image.new('RGB', (W * per + 130, W * len(rows)), (30, 26, 36))
    d = ImageDraw.Draw(sheet)
    for y, (name, row) in enumerate(rows):
        d.text((6, y * W + W // 2), name, fill=(255, 230, 180))
        for x, p in enumerate(row):
            sheet.paste(Image.open(p).convert('RGB'), (130 + x * W, y * W))
    sheet.save(os.path.join(out, f'sheet_{cid}.png'))
    print('sheet', os.path.join(out, f'sheet_{cid}.png'))
except ImportError:
    print('Pillow missing; individual frames in', out)

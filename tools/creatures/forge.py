"""Creature Forge: shared Blender helpers for rigging and animating the user's models.

Run through Blender's Python (the `bpy` module or `blender --background --python`).
Every creature is normalised to the same conventions before it is animated:

* metres, feet (or belly) on z = 0, centred on the origin;
* facing -Y, with the creature's left on +X and up on +Z (glTF export turns this
  into three.js' +Z forward, +Y up);
* canonical bone names (hips, spine, chest, neck, head, upperarm.L, ...), so the
  game can find hands and heads without per-model tables.

Poses are written as rotations about the armature's axes, relative to the rest pose,
which makes the clip library rig-independent: `-X` swings a hanging limb forward,
`+X` bends a knee back, `+Z` turns left, `-Y`/`+Y` raise the left/right arm sideways.
"""
import math
import os

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'models')
OUT = os.path.join(ROOT, 'public', 'models', 'creatures')
FPS = 30


# --- scene -------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def import_model(model_id, keep_pose=None):
    """Imports a library GLB and strips importer helpers, empties and old actions.

    keep_pose: substring of a source action whose first frame becomes the rest pose
    (for models whose bind pose is not a usable stance)."""
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f'{model_id}.glb'))
    if keep_pose:
        arm = armature()
        action = next(a for a in bpy.data.actions if keep_pose in a.name)
        arm.animation_data.action = action
        bpy.context.scene.frame_set(int(action.frame_range[0]))
        bpy.context.view_layer.update()
        saved = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
        arm.animation_data_clear()
        for pb in arm.pose.bones:
            pb.matrix_basis = saved[pb.name]
        bpy.context.view_layer.update()
        for o in list(bpy.data.objects):
            if o.type == 'MESH' and o.name.startswith('Icosphere'):
                bpy.data.objects.remove(o, do_unlink=True)
        apply_pose_as_rest()
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and (o.name.startswith('Icosphere') or 'badge' in o.name.lower()):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for o in bpy.data.objects:
        if o.type == 'ARMATURE':
            o.data.pose_position = 'POSE'
            for pb in o.pose.bones:
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = Quaternion()
                pb.location = Vector()
                pb.scale = Vector((1, 1, 1))
    bpy.context.view_layer.update()


def meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH']


def armature():
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    return arms[0] if arms else None


def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def evaluated_bounds(objs=None):
    """World-space bounds of the deformed meshes."""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs or meshes():
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        for v in me.vertices:
            p = o.matrix_world @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        eo.to_mesh_clear()
    return lo, hi


def apply_transforms():
    """Bakes object transforms into mesh and bone data (all objects end at identity)."""
    arm = armature()
    for m in meshes():
        if m.parent:
            mw = m.matrix_world.copy()
            m.parent = None
            m.matrix_world = mw
    objs = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE')]
    select_only(objs)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if arm:
        for m in meshes():
            m.parent = arm
            m.matrix_parent_inverse = Matrix()
    bpy.context.view_layer.update()


def normalise(rotate_z_deg=0.0, height=None, length=None, ground=True, center=True, z_offset=0.0):
    """Rotates about Z, scales to a height (or longest horizontal length) and grounds."""
    objs = [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE') and o.parent is None]
    rot = Matrix.Rotation(math.radians(rotate_z_deg), 4, 'Z')
    for o in objs:
        o.matrix_world = rot @ o.matrix_world
    bpy.context.view_layer.update()
    apply_transforms()
    lo, hi = evaluated_bounds()
    size = hi - lo
    s = 1.0
    if height:
        s = height / size.z
    elif length:
        s = length / max(size.x, size.y)
    offset = Vector((-(lo.x + hi.x) / 2 if center else 0, -(lo.y + hi.y) / 2 if center else 0, -lo.z if ground else 0))
    for o in [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE') and o.parent is None]:
        o.matrix_world = Matrix.Translation(offset * s + Vector((0, 0, z_offset))) @ Matrix.Scale(s, 4) @ o.matrix_world
    bpy.context.view_layer.update()
    apply_transforms()
    return evaluated_bounds()


def rename_bones(mapping):
    """Renames bones (vertex groups follow automatically)."""
    arm = armature()
    for old, new in mapping.items():
        b = arm.data.bones.get(old)
        if b:
            b.name = new


def reparent_bone(child, parent):
    arm = armature()
    select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    eb[child].parent = eb[parent]
    eb[child].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')


def apply_pose_as_rest():
    """Bakes the current pose into the meshes and makes it the new rest pose."""
    arm = armature()
    for m in meshes():
        mod = next((x for x in m.modifiers if x.type == 'ARMATURE'), None)
        if not mod:
            continue
        select_only([m])
        bpy.ops.object.modifier_apply(modifier=mod.name)
    select_only([arm])
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for m in meshes():
        if any(x.type == 'ARMATURE' for x in m.modifiers):
            continue
        mod = m.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    bpy.context.view_layer.update()


# --- rotations in armature axes ------------------------------------------------

def arm_rot(x=0.0, y=0.0, z=0.0):
    """Rotation matrix from degrees about armature X, then Y, then Z."""
    return (Matrix.Rotation(math.radians(z), 3, 'Z') @ Matrix.Rotation(math.radians(y), 3, 'Y')
            @ Matrix.Rotation(math.radians(x), 3, 'X'))


def set_pose(pose, root_offset=None, root='hips'):
    """pose: {bone: (x, y, z) degrees about armature axes}. Unlisted bones return to rest."""
    arm = armature()
    for pb in arm.pose.bones:
        rest = pb.bone.matrix_local.to_3x3()
        rot = pose.get(pb.name)
        if rot is None:
            pb.rotation_quaternion = Quaternion()
        else:
            r = rot if isinstance(rot, Matrix) else arm_rot(*rot)
            pb.rotation_quaternion = (rest.inverted() @ r @ rest).to_quaternion()
        pb.location = Vector()
    if root_offset is not None and root in arm.pose.bones:
        pb = arm.pose.bones[root]
        rest = pb.bone.matrix_local.to_3x3()
        pb.location = rest.inverted() @ Vector(root_offset)


def key_pose(frame, bones=None):
    arm = armature()
    for pb in arm.pose.bones:
        if bones and pb.name not in bones:
            continue
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


# --- clip authoring -----------------------------------------------------------------

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = max(0.0, min(1.0, t))
    return t ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def blend_pose(a, b, t):
    """Component-wise blend of two semantic poses (missing bones read as rest)."""
    out = {}
    for k in set(a) | set(b):
        pa = a.get(k, (0, 0, 0))
        pb = b.get(k, (0, 0, 0))
        out[k] = tuple(lerp(pa[i], pb[i], t) for i in range(3))
    return out


def add_pose(a, b, k=1.0):
    out = dict(a)
    for name, r in b.items():
        base = out.get(name, (0, 0, 0))
        out[name] = tuple(base[i] + r[i] * k for i in range(3))
    return out


def keyed(keys, t, easing=smooth):
    """keys: [(time, pose, root_offset)], sorted. Returns (pose, root) at time t."""
    if t <= keys[0][0]:
        return keys[0][1], keys[0][2] if len(keys[0]) > 2 else (0, 0, 0)
    for i in range(len(keys) - 1):
        t0, p0 = keys[i][0], keys[i][1]
        t1, p1 = keys[i + 1][0], keys[i + 1][1]
        if t <= t1:
            u = easing((t - t0) / max(t1 - t0, 1e-6))
            r0 = keys[i][2] if len(keys[i]) > 2 else (0, 0, 0)
            r1 = keys[i + 1][2] if len(keys[i + 1]) > 2 else (0, 0, 0)
            return blend_pose(p0, p1, u), tuple(lerp(r0[j], r1[j], u) for j in range(3))
    last = keys[-1]
    return last[1], last[2] if len(last) > 2 else (0, 0, 0)


class Clip:
    """A named clip sampled from a function of time: fn(t) -> (pose, root_offset)."""

    def __init__(self, name, seconds, fn, loop=False, events=None):
        self.name = name
        self.seconds = seconds
        self.fn = fn
        self.loop = loop
        self.events = events or {}


def bake(clips, root='hips', step=2):
    """Creates one action per clip on the armature; returns clip metadata.

    Only bones a clip actually moves are keyed; three.js blends unkeyed bones back to
    their rest pose, so this keeps files small without changing what plays."""
    arm = armature()
    arm.animation_data_create()
    meta = {}
    for clip in clips:
        frames = max(2, round(clip.seconds * FPS))
        samples = []
        f = 0
        while True:
            t = min(f / FPS, clip.seconds)
            if clip.loop and f >= frames:
                t = 0.0  # close the loop exactly on the first pose
            samples.append((f, clip.fn(t)))
            if f >= frames:
                break
            f = min(frames, f + step)
        used = {root}
        for _, (pose, _) in samples:
            for name, r in pose.items():
                if isinstance(r, Matrix) or any(abs(v) > 1e-4 for v in r):
                    used.add(name)
        used &= set(arm.pose.bones.keys())
        action = bpy.data.actions.new(clip.name)
        action.use_fake_user = True
        arm.animation_data.action = action
        for f, (pose, offset) in samples:
            set_pose(pose, offset, root)
            key_pose(f + 1, used)
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        meta[clip.name] = {'seconds': round(clip.seconds, 4), 'loop': clip.loop, 'events': clip.events}
        track = arm.animation_data.nla_tracks.new()
        track.name = clip.name
        strip = track.strips.new(clip.name, 1, action)
        strip.name = clip.name
        track.mute = True
    arm.animation_data.action = None
    set_pose({})
    return meta


# --- automatic skinning for unrigged models -------------------------------------------

def build_armature(bones, name='Armature'):
    """bones: [(name, head, tail, parent)] in world metres. Returns the armature object."""
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, head, tail, parent in bones:
        eb = data.edit_bones.new(bname)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        if parent:
            eb.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm


def seg_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def skin(mesh, arm, falloff=0.12, rules=None, max_influences=3, sharpness=4.0):
    """Distance-based skinning: each vertex is weighted to the nearest bone segments.

    `rules(bone_name, co) -> factor` can forbid (0) or discourage bones for a vertex,
    which keeps a leg from dragging the opposite leg or a wing from pulling the body.
    """
    for vg in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(vg)
    segs = []
    for b in arm.data.bones:
        if b.get('nodeform'):
            continue
        segs.append((b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local))
    groups = {name: mesh.vertex_groups.new(name=name) for name, _, _ in segs}
    mw = mesh.matrix_world
    for v in mesh.data.vertices:
        p = mw @ v.co
        scored = []
        for name, a, b in segs:
            d, _ = seg_distance(p, a, b)
            f = rules(name, p) if rules else 1.0
            if f <= 0:
                continue
            scored.append((d / f, name))
        scored.sort()
        if not scored:
            continue
        best = scored[0][0]
        picked = []
        for d, name in scored[:max_influences]:
            w = math.exp(-((d - best) / falloff) ** 2 * sharpness)
            if w > 0.02:
                picked.append((name, w))
        total = sum(w for _, w in picked)
        for name, w in picked:
            groups[name].add([v.index], w / total, 'REPLACE')
    for mod in list(mesh.modifiers):
        if mod.type == 'ARMATURE':
            mesh.modifiers.remove(mod)
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()


def join_meshes(name=None):
    ms = meshes()
    if len(ms) > 1:
        select_only(ms, ms[0])
        bpy.ops.object.join()
    m = meshes()[0]
    if name:
        m.name = name
    return m


# --- export ---------------------------------------------------------------------------

def export(creature_id):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{creature_id}.glb')
    select_only([o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE')])
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS',
        export_frame_step=1, export_force_sampling=False, export_optimize_animation_size=True,
        export_anim_single_armature=True, export_reset_pose_bones=True,
        export_skins=True, export_all_influences=False, export_def_bones=False,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_image_format='AUTO', export_extras=False,
        export_morph=False, export_lights=False, export_cameras=False,
    )
    return path


# --- re-posing with Blender's IK solver -----------------------------------------------

def ik_repose(targets, rotations=None):
    """Moves limb ends to targets with temporary IK constraints, then keeps the result
    as the new rest pose. targets: {bone: (position, chain_count)} where the bone's
    tail is pulled to position; rotations: {bone: (x, y, z)} applied first (FK)."""
    arm = armature()
    if rotations:
        set_pose(rotations)
    bpy.context.view_layer.update()
    empties = []
    for bone, (pos, chain) in targets.items():
        e = bpy.data.objects.new(f'ik_{bone}', None)
        bpy.context.scene.collection.objects.link(e)
        e.location = Vector(pos)
        empties.append(e)
        c = arm.pose.bones[bone].constraints.new('IK')
        c.target = e
        c.chain_count = chain
        c.use_tail = True
    bpy.context.view_layer.update()
    # Freeze the solved pose into plain rotations, parents before children.
    solved = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    order = sorted(arm.pose.bones, key=lambda pb: len(pb.parent_recursive))
    for pb in order:
        pb.matrix = solved[pb.name]
        bpy.context.view_layer.update()
    for e in empties:
        bpy.data.objects.remove(e, do_unlink=True)
    apply_pose_as_rest()

"""Builds the animated creature GLBs into public/models/creatures/.

    python tools/creatures/build.py -- nemesis pale      (with Blender's bpy module)
    blender --background --python tools/creatures/build.py -- all

Each builder imports a library model, normalises it (forge.normalise), rigs it if it
has no skeleton, authors its clips and exports it. `creatures.json` records clip
lengths, loop flags and hit events for the game.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import forge  # noqa: E402
import humanoid  # noqa: E402
import quadruped  # noqa: E402
import dragon  # noqa: E402

VALVE = {
    'ValveBiped.Bip01_Pelvis': 'hips', 'ValveBiped.Bip01_Spine': 'spine', 'ValveBiped.Bip01_Spine1': 'spine1',
    'ValveBiped.Bip01_Spine2': 'chest', 'ValveBiped.Bip01_Spine4': 'upperchest', 'ValveBiped.Bip01_Neck1': 'neck',
    'ValveBiped.Bip01_Head1': 'head',
}
for side, s in (('L', 'L'), ('R', 'R')):
    VALVE.update({
        f'ValveBiped.Bip01_{side}_Clavicle': f'shoulder.{s}', f'ValveBiped.Bip01_{side}_UpperArm': f'upperarm.{s}',
        f'ValveBiped.Bip01_{side}_Forearm': f'forearm.{s}', f'ValveBiped.Bip01_{side}_Hand': f'hand.{s}',
        f'ValveBiped.Bip01_{side}_Thigh': f'thigh.{s}', f'ValveBiped.Bip01_{side}_Calf': f'shin.{s}',
        f'ValveBiped.Bip01_{side}_Foot': f'foot.{s}', f'ValveBiped.Bip01_{side}_Toe0': f'toe.{s}',
    })

HUMANIK = {'Character1_Hips': 'hips', 'Character1_Spine': 'spine', 'Character1_Spine1': 'spine1',
           'Character1_Spine2': 'chest', 'Character1_Neck': 'neck', 'Character1_Head': 'head'}
for side, s in (('Left', 'L'), ('Right', 'R')):
    HUMANIK.update({
        f'Character1_{side}Shoulder': f'shoulder.{s}', f'Character1_{side}Arm': f'upperarm.{s}',
        f'Character1_{side}ForeArm': f'forearm.{s}', f'Character1_{side}Hand': f'hand.{s}',
        f'Character1_{side}UpLeg': f'thigh.{s}', f'Character1_{side}Leg': f'shin.{s}',
        f'Character1_{side}Foot': f'foot.{s}', f'Character1_{side}ToeBase': f'toe.{s}',
    })


def add_socket(name, parent, head, tail):
    """Adds a non-deforming bone (weapon grips, mouths, stingers) for the game to follow."""
    arm = forge.armature()
    forge.select_only([arm])
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones.new(name)
    eb.head = Vector(head)
    eb.tail = Vector(tail)
    eb.parent = arm.data.edit_bones[parent]
    eb.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')


def bone_head(name):
    arm = forge.armature()
    return arm.matrix_world @ arm.data.bones[name].head_local


def bone_tail(name):
    arm = forge.armature()
    return arm.matrix_world @ arm.data.bones[name].tail_local


def grip_sockets():
    """grip.R/L at each fist, pointing forward (-Y) with the arm hanging."""
    for s in ('R', 'L'):
        hand = bone_head(f'hand.{s}')
        fore = bone_head(f'forearm.{s}')
        down = (hand - fore).normalized()
        palm = hand + down * 0.07 * (hand - fore).length / 0.25
        add_socket(f'grip.{s}', f'hand.{s}', palm, palm + Vector((0, -0.3, 0)))


def arms_down(target_deg=12.0):
    """Rotates the upper arms about Y until each arm hangs `target_deg` from vertical."""
    import math
    rot = {}
    for s, sign in (('L', 1), ('R', -1)):
        v = bone_head(f'hand.{s}') - bone_head(f'upperarm.{s}')
        current = math.degrees(math.atan2(abs(v.x), -v.z))
        rot[f'upperarm.{s}'] = (0, sign * (current - target_deg), 0)
    forge.set_pose(rot)
    forge.apply_pose_as_rest()


def limb_rules(z_hip, z_shoulder, x_mid=0.0):
    """Keeps leg bones below the waist, arm bones above it and sides apart."""
    def rule(name, p):
        side = 1 if name.endswith('.L') else -1 if name.endswith('.R') else 0
        if name.startswith(('thigh', 'shin', 'foot', 'toe')):
            if p.z > z_hip + 0.12:
                return 0
            if side and (p.x - x_mid) * side < -0.08:
                return 0
        if name.startswith(('upperarm', 'forearm', 'hand')):
            if p.z < z_hip - 0.1:
                return 0.6
            if side and (p.x - x_mid) * side < -0.05:
                return 0
        if name.startswith('shoulder') and side and (p.x - x_mid) * side < -0.05:
            return 0
        return 1.0
    return rule


# --- builders -------------------------------------------------------------------------

def build_nemesis():
    """The trench-coated brute: Stitched Brutes, Shadow Knights and Morrow the Gravewarden."""
    forge.reset()
    forge.import_model('ps1-nemesis')
    forge.rename_bones(VALVE)
    forge.normalise(height=2.2)
    arms_down(14)
    grip_sockets()
    add_socket('mouth', 'head', bone_head('head') + Vector((0, -0.12, 0.05)), bone_head('head') + Vector((0, -0.4, 0.05)))
    style = {'height': 2.2, 'weight': 1.1, 'hunch': 6, 'wide': 8, 'arms': 'weapon'}
    meta = forge.bake(humanoid.clips(style))
    return 'nemesis', meta, 2.2


def build_pale():
    """The pale blade-armed hollow: T-pose rest lowered to an A-pose first."""
    forge.reset()
    forge.import_model('monster-ps1-style')
    forge.rename_bones(HUMANIK)
    forge.normalise(height=2.0)
    arms_down(16)
    forge.normalise(height=2.0)
    grip_sockets()
    style = {'height': 2.0, 'weight': 0.85, 'hunch': 18, 'wide': 10, 'arms': 'claws'}
    meta = forge.bake(humanoid.clips(style))
    return 'pale', meta, 2.0


def build_demon():
    """The shadow demon: skinned from scratch, then IK-straightened out of its lunge."""
    forge.reset()
    forge.import_model('shadow-demon-creature-hitem3d-vs-supavoxel')
    forge.normalise(height=2.4)
    mesh = forge.join_meshes('demon')
    bones = [
        ('hips', (0.03, 0.3, 0.88), (0.0, 0.25, 1.15), None),
        ('spine', (0.0, 0.25, 1.15), (-0.05, 0.2, 1.45), 'hips'),
        ('chest', (-0.05, 0.2, 1.45), (-0.1, 0.12, 1.72), 'spine'),
        ('neck', (-0.1, 0.12, 1.72), (-0.18, 0.02, 1.86), 'chest'),
        ('head', (-0.18, 0.02, 1.86), (-0.22, -0.1, 2.2), 'neck'),
        ('shoulder.L', (0.02, 0.15, 1.7), (0.33, 0.1, 1.74), 'chest'),
        ('upperarm.L', (0.33, 0.1, 1.74), (0.5, -0.2, 1.56), 'shoulder.L'),
        ('forearm.L', (0.5, -0.2, 1.56), (0.55, -0.58, 1.55), 'upperarm.L'),
        ('hand.L', (0.55, -0.58, 1.55), (0.56, -0.8, 1.82), 'forearm.L'),
        ('shoulder.R', (-0.14, 0.2, 1.7), (-0.44, 0.3, 1.68), 'chest'),
        ('upperarm.R', (-0.44, 0.3, 1.68), (-0.64, 0.55, 1.34), 'shoulder.R'),
        ('forearm.R', (-0.64, 0.55, 1.34), (-0.8, 0.74, 1.06), 'upperarm.R'),
        ('hand.R', (-0.8, 0.74, 1.06), (-0.86, 0.8, 0.84), 'forearm.R'),
        ('thigh.L', (0.18, 0.25, 0.86), (0.5, 0.05, 0.5), 'hips'),
        ('shin.L', (0.5, 0.05, 0.5), (0.76, -0.08, 0.1), 'thigh.L'),
        ('foot.L', (0.76, -0.08, 0.1), (0.86, -0.34, 0.03), 'shin.L'),
        ('thigh.R', (-0.14, 0.36, 0.86), (-0.36, 0.56, 0.5), 'hips'),
        ('shin.R', (-0.36, 0.56, 0.5), (-0.32, 0.76, 0.12), 'thigh.R'),
        ('foot.R', (-0.32, 0.76, 0.12), (-0.42, 0.56, 0.03), 'shin.R'),
    ]
    arm = forge.build_armature(bones, 'DemonRig')
    forge.skin(mesh, arm, falloff=0.1, rules=limb_rules(0.95, 1.7, 0.0))
    # Out of the lunge: feet under the hips, arms hanging forward with the claws out.
    forge.ik_repose({
        'shin.L': ((0.34, 0.05, 0.12), 2), 'shin.R': ((-0.34, 0.12, 0.12), 2),
        'forearm.L': ((0.62, -0.25, 0.95), 2), 'forearm.R': ((-0.62, -0.2, 0.95), 2),
    })
    forge.normalise(height=2.4)
    style = {'height': 2.4, 'weight': 0.95, 'hunch': 16, 'wide': 12, 'arms': 'claws'}
    meta = forge.bake(humanoid.clips(style))
    return 'demon', meta, 2.4


def mirror(bones):
    """Adds .R copies of .L bones (x mirrored)."""
    out = list(bones)
    for name, head, tail, parent in bones:
        if name.endswith('.L'):
            m = lambda v: (-v[0], v[1], v[2])
            out.append((name[:-2] + '.R', m(head), m(tail), parent[:-2] + '.R' if parent.endswith('.L') else parent))
    return out


def build_wanderer():
    """The masked, cloaked pilgrim: Oswin the Wanderer, and recoloured, the Sunkeepers."""
    forge.reset()
    forge.import_model('ps1-game-character')
    forge.normalise(rotate_z_deg=-90, height=1.9)
    mesh = forge.join_meshes('wanderer')
    bones = mirror([
        ('hips', (0, 0, 0.88), (0, 0, 1.1), None),
        ('spine', (0, 0, 1.1), (0, 0, 1.35), 'hips'),
        ('chest', (0, 0, 1.35), (0, 0, 1.6), 'spine'),
        ('neck', (0, 0, 1.6), (0, -0.02, 1.72), 'chest'),
        ('head', (0, -0.02, 1.72), (0, -0.02, 1.92), 'neck'),
        ('shoulder.L', (0.05, 0, 1.58), (0.18, 0, 1.56), 'chest'),
        ('upperarm.L', (0.18, 0, 1.56), (0.24, 0, 1.28), 'shoulder.L'),
        ('forearm.L', (0.24, 0, 1.28), (0.27, -0.02, 1.02), 'upperarm.L'),
        ('hand.L', (0.27, -0.02, 1.02), (0.28, -0.03, 0.9), 'forearm.L'),
        ('thigh.L', (0.11, 0, 0.88), (0.12, 0, 0.5), 'hips'),
        ('shin.L', (0.12, 0, 0.5), (0.12, 0, 0.1), 'thigh.L'),
        ('foot.L', (0.12, 0, 0.1), (0.12, -0.2, 0.03), 'shin.L'),
    ])
    arm = forge.build_armature(bones, 'WandererRig')
    forge.skin(mesh, arm, falloff=0.08, rules=limb_rules(0.9, 1.56, 0.0))
    grip_sockets()
    style = {'height': 1.9, 'weight': 0.9, 'hunch': 4, 'wide': 4, 'arms': 'staff'}
    meta = forge.bake(humanoid.clips(style))
    return 'wanderer', meta, 1.9


def quad_rules(y_front, y_back, z_belly):
    """Legs only take the leg geometry on their own side; the tail stays in the tail."""
    def rule(name, p):
        side = 1 if name.endswith('.L') else -1 if name.endswith('.R') else 0
        leg = name.startswith(('frontleg', 'frontshin', 'frontpaw', 'backleg', 'backshin', 'backpaw'))
        if leg:
            if p.z > z_belly + 0.05:
                return 0.25
            if side and p.x * side < -0.02:
                return 0
        elif p.z < z_belly - 0.08 and name not in ('head', 'neck', 'jaw'):
            return 0.2
        if name.startswith('tail') and p.y < y_back:
            return 0
        return 1.0
    return rule


def build_bingus():
    """The hairless cat: Pale Gnawers in the Crystal Deep; scaled up, the Glutton Below."""
    forge.reset()
    forge.import_model('bingus')
    forge.normalise(height=1.3)
    mesh = forge.join_meshes('bingus')
    bones = mirror([
        ('hips', (0, 0.4, 0.72), (0, 0.05, 0.72), None),
        ('spine', (0, 0.05, 0.72), (0, -0.3, 0.74), 'hips'),
        ('chest', (0, -0.3, 0.74), (0, -0.58, 0.76), 'spine'),
        ('neck', (0, -0.58, 0.76), (0, -0.72, 0.84), 'chest'),
        ('head', (0, -0.72, 0.84), (0, -1.12, 0.86), 'neck'),
        ('tail1', (0, 0.54, 0.86), (0, 0.85, 0.86), 'hips'),
        ('tail2', (0, 0.85, 0.86), (0, 1.16, 0.86), 'tail1'),
        ('frontleg.L', (0.19, -0.44, 0.52), (0.19, -0.44, 0.22), 'chest'),
        ('frontshin.L', (0.19, -0.44, 0.22), (0.19, -0.44, 0.05), 'frontleg.L'),
        ('frontpaw.L', (0.19, -0.44, 0.05), (0.19, -0.6, 0.02), 'frontshin.L'),
        ('backleg.L', (0.19, 0.37, 0.52), (0.19, 0.37, 0.22), 'hips'),
        ('backshin.L', (0.19, 0.37, 0.22), (0.19, 0.37, 0.05), 'backleg.L'),
        ('backpaw.L', (0.19, 0.37, 0.05), (0.19, 0.2, 0.02), 'backshin.L'),
    ])
    arm = forge.build_armature(bones, 'BingusRig')
    forge.skin(mesh, arm, falloff=0.06, rules=quad_rules(-0.6, 0.5, 0.45), max_influences=2)
    add_socket('mouth', 'head', (0, -1.1, 0.6), (0, -1.3, 0.6))
    meta = forge.bake(quadruped.clips({'height': 1.3, 'weight': 0.9, 'stride': 26}))
    return 'bingus', meta, 1.3


HORSE = {'spine.001': 'hips', 'spine.003': 'spine', 'spine.005': 'chest', 'neck.001': 'neck', 'head': 'head',
         'tail.001': 'tail1', 'tail.003': 'tail2'}
for s_ in ('L', 'R'):
    HORSE.update({f'thigh.{s_}': f'backleg.{s_}', f'lower_leg.{s_}': f'backshin.{s_}', f'hind_foot.{s_}': f'backpaw.{s_}',
                  f'upper_arm.{s_}': f'frontleg.{s_}', f'forearm.{s_}': f'frontshin.{s_}', f'forefoot.{s_}': f'frontpaw.{s_}'})


def build_horse():
    """The PS1 horse, re-proportioned: Nightmare Steeds and Sir Caddoc's mount."""
    forge.reset()
    forge.import_model('cavalo-no-estilo-de-ps1')
    # The source armature carries a stretching object scale (3.8 x 2.6 x 0.78); the
    # mesh and bones are a well-proportioned horse without it.
    arm = forge.armature()
    arm.scale = (1, 1, 1)
    arm.location = (0, 0, 0)
    bpy.context.view_layer.update()
    forge.apply_transforms()
    forge.rename_bones(HORSE)
    forge.normalise(height=2.1)
    add_socket('saddle', 'spine', bone_head('spine') + Vector((0, 0, 0.25)), bone_head('spine') + Vector((0, -0.3, 0.25)))
    add_socket('mouth', 'head', bone_head('head') + Vector((0, -0.25, -0.1)), bone_head('head') + Vector((0, -0.5, -0.1)))
    meta = forge.bake(quadruped.clips({'height': 2.1, 'weight': 1.0, 'stride': 30}))
    return 'horse', meta, 2.1


def build_bee():
    """The PS1 bee: Gloom Wasps in the Humming Orchard; scaled up, the Hive Queen."""
    import math
    from forge import Clip, keyed
    forge.reset()
    forge.import_model('ps1-bee')
    forge.normalise(rotate_z_deg=90, height=0.64)
    mesh = forge.join_meshes('bee')
    bones = mirror([
        ('body', (0, 0.15, 0.32), (0, -0.35, 0.32), None),
        ('head', (0, -0.35, 0.32), (0, -0.62, 0.3), 'body'),
        ('abdomen', (0, 0.15, 0.3), (0, 0.8, 0.12), 'body'),
        ('wing.L', (0.06, 0.3, 0.56), (0.5, 0.55, 0.56), 'body'),
    ])
    arm = forge.build_armature(bones, 'BeeRig')

    def rule(name, p):
        wingy = p.z > 0.5 and abs(p.x) > 0.13
        if name.startswith('wing'):
            return 1.0 if wingy and (p.x > 0) == name.endswith('.L') else 0
        return 0 if wingy else 1.0
    forge.skin(mesh, arm, falloff=0.05, rules=rule, max_influences=2)
    add_socket('stinger', 'abdomen', (0, 0.8, 0.1), (0, 0.95, 0.05))
    T = 0.12

    def flap(t, extra=None, bob=0.03):
        a = 38 * math.sin(math.tau * t / T)
        pose = {'wing.L': (0, -a, 0), 'wing.R': (0, a, 0), 'abdomen': (4 * math.sin(math.tau * t / 0.6), 0, 0)}
        if extra:
            pose.update(extra)
        return pose, (0, 0, bob * math.sin(math.tau * t / 0.6))
    clips = [
        Clip('idle', 0.6, lambda t: flap(t), loop=True),
        Clip('walk', 0.6, lambda t: flap(t, {'body': (8, 0, 0)}), loop=True),
        Clip('run', 0.6, lambda t: flap(t, {'body': (18, 0, 0)}, 0.05), loop=True),
    ]
    sting_keys = [(0, {}), (0.35, {'body': (-15, 0, 0), 'abdomen': (25, 0, 0)}, (0, 0.15, 0.1)),
                  (0.5, {'body': (20, 0, 0), 'abdomen': (-75, 0, 0), 'head': (-20, 0, 0)}, (0, -0.35, -0.05)),
                  (0.75, {'body': (20, 0, 0), 'abdomen': (-75, 0, 0)}, (0, -0.35, -0.05)), (1.0, {})]

    def sting(t):
        pose, root = keyed(sting_keys, t)
        wings, _ = flap(t)
        pose.update({k: v for k, v in wings.items() if k.startswith('wing')})
        return pose, root
    clips.append(Clip('attack_sting', 1.0, sting, events={'hit': 0.48}))
    clips.append(Clip('hit', 0.4, lambda t: (dict(flap(t)[0], body=(-25 * math.sin(math.pi * min(1, t / 0.4)), 0, 15)), (0, 0.1, 0))))
    clips.append(Clip('stagger', 1.0, lambda t: (dict(flap(t * 0.5)[0], body=(-30, 30 * math.sin(t * 12), 0)), (0, 0, -0.1 * t))))

    def death(t):
        k = min(1, t / 1.2)
        return {'body': (0, 170 * k, 0), 'wing.L': (0, -20, 0), 'wing.R': (0, 20, 0), 'abdomen': (-40 * k, 0, 0)}, (0, 0, -0.3 * k)
    clips.append(Clip('death', 1.4, death))
    clips.append(Clip('roar', 1.2, lambda t: flap(t, {'body': (-25, 0, 0), 'abdomen': (-40, 0, 0)}, 0.08), events={'hit': 0.4}))
    meta = forge.bake(clips, root='body')
    return 'bee', meta, 0.64


def build_chicken():
    """The PS1 chicken: livestock pecking around Hollowmere and the farmsteads."""
    import math
    from forge import Clip
    forge.reset()
    forge.import_model('ps1-chicken')
    forge.normalise(rotate_z_deg=-90, height=0.5)
    mesh = forge.join_meshes('chicken')
    bones = mirror([
        ('body', (0, 0.12, 0.24), (0, -0.08, 0.28), None),
        ('neck', (0, -0.08, 0.3), (0, -0.14, 0.42), 'body'),
        ('head', (0, -0.14, 0.42), (0, -0.26, 0.44), 'neck'),
        ('thigh.L', (0.07, 0.03, 0.16), (0.07, 0.01, 0.02), 'body'),
    ])
    arm = forge.build_armature(bones, 'ChickenRig')

    def rule(name, p):
        if name.startswith('thigh'):
            return 1.0 if p.z < 0.16 and (p.x > 0) == name.endswith('.L') else 0
        if name in ('neck', 'head'):
            return 1.0 if p.y < -0.05 and p.z > 0.3 else 0.3
        return 1.0 if p.z >= 0.12 else 0.2
    forge.skin(mesh, arm, falloff=0.04, rules=rule, max_influences=2)

    def walk(t, T, amp, peck=0.0):
        p = math.tau * t / T
        return ({'thigh.L': (-amp * math.sin(p), 0, 0), 'thigh.R': (amp * math.sin(p), 0, 0),
                 'neck': (18 * math.sin(2 * p) + peck, 0, 0), 'head': (-10 * math.sin(2 * p), 0, 0), 'body': (0, 0, 4 * math.sin(p))},
                (0, 0, 0.01 * abs(math.sin(p))))
    clips = [
        Clip('idle', 2.0, lambda t: ({'neck': (0, 0, 20 * math.sin(math.tau * t / 2)), 'head': (6 * math.sin(math.tau * t), 0, 0)}, (0, 0, 0)), loop=True),
        Clip('walk', 0.6, lambda t: walk(t, 0.6, 28), loop=True),
        Clip('run', 0.3, lambda t: walk(t, 0.3, 40), loop=True),
    ]

    def peck(t):
        k = math.sin(math.pi * min(1, t / 0.5)) if t < 0.5 else 0
        return {'neck': (70 * k, 0, 0), 'head': (30 * k, 0, 0), 'body': (15 * k, 0, 0)}, (0, 0, 0)
    clips.append(Clip('attack_peck', 0.9, peck, events={'hit': 0.25}))
    clips.append(Clip('death', 1.0, lambda t: ({'body': (0, 90 * min(1, t / 0.4), 0), 'neck': (-30, 0, 0), 'thigh.L': (-40, 0, 0)}, (0, 0, -0.08 * min(1, t / 0.4)))))
    meta = forge.bake(clips, root='body')
    return 'chicken', meta, 0.5


def build_dragon():
    """Vermilion: the source rig's IK targets become FK children so wings, hands and feet
    follow their limbs, then flight and ground clips are authored."""
    forge.reset()
    forge.import_model('red-dragon')
    forge.join_meshes('dragon')
    for child, parent in (('hand.L', 'forearm.L'), ('hand.R', 'forearm.R'), ('foot.L', 'ankle.L'), ('foot.R', 'ankle.R'),
                          ('wingHand.L', 'lowerWing.L'), ('wingHand.R', 'lowerWing.R')):
        forge.reparent_bone(child, parent)
    length = 22.0
    forge.normalise(rotate_z_deg=180)
    lo, hi = forge.evaluated_bounds()
    scale = length / (hi.y - lo.y)
    forge.normalise(height=(hi.z - lo.z) * scale)
    head = bone_head('head')
    jaw_t = bone_tail('jaw')
    add_socket('mouth', 'head', jaw_t, jaw_t + (jaw_t - head).normalized() * 0.8)
    meta = forge.bake(dragon.clips(scale * 1.0), root='pelvis')
    lo, hi = forge.evaluated_bounds()
    return 'dragon', meta, round(hi.z - lo.z, 3)


BUILDERS = {
    'dragon': build_dragon,
    'bee': build_bee,
    'chicken': build_chicken,
    'horse': build_horse,
    'bingus': build_bingus,
    'wanderer': build_wanderer,
    'demon': build_demon,
    'nemesis': build_nemesis,
    'pale': build_pale,
}


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
    names = list(BUILDERS) if 'all' in args else args
    manifest_path = os.path.join(forge.OUT, 'creatures.json')
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f)
    for name in names:
        cid, meta, height = BUILDERS[name]()
        path = forge.export(cid)
        manifest[cid] = {'url': f'models/creatures/{cid}.glb', 'height': height, 'bytes': os.path.getsize(path), 'clips': meta}
        print(f'built {cid}: {len(meta)} clips, {os.path.getsize(path) / 1024:.0f} KiB')
    os.makedirs(forge.OUT, exist_ok=True)
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)


if __name__ == '__main__':
    main()

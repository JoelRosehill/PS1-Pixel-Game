"""Quadruped clip library (armature-axis rotations, see forge.py for conventions).

Canonical bones: hips (pelvis), spine, chest, neck, head, jaw (optional), tail1, tail2,
frontleg/frontshin/frontpaw.L/R, backleg/backshin/backpaw.L/R. Missing bones are ignored.

style: height (m at the shoulder/back), weight (timing), stride (degrees).
"""
import math

from forge import Clip, add_pose, ease_out, keyed

TAU = math.pi * 2


def Q(**bones):
    return {k.replace('_L', '.L').replace('_R', '.R'): v for k, v in bones.items()}


def legs(fl, fr, bl, br, lift_fl=0, lift_fr=0, lift_bl=0, lift_br=0):
    """Leg swings (deg, negative = forward) plus knee lifts (0..1)."""
    return Q(frontleg_L=(fl, 0, 0), frontleg_R=(fr, 0, 0), backleg_L=(bl, 0, 0), backleg_R=(br, 0, 0),
             frontshin_L=(50 * lift_fl, 0, 0), frontshin_R=(50 * lift_fr, 0, 0),
             backshin_L=(55 * lift_bl, 0, 0), backshin_R=(55 * lift_br, 0, 0),
             frontpaw_L=(-fl * 0.5 + 25 * lift_fl, 0, 0), frontpaw_R=(-fr * 0.5 + 25 * lift_fr, 0, 0),
             backpaw_L=(-bl * 0.5 - 20 * lift_bl, 0, 0), backpaw_R=(-br * 0.5 - 20 * lift_br, 0, 0))


def clips(style):
    h = style.get('height', 1.0)
    w = style.get('weight', 1.0)
    stride = style.get('stride', 28)
    out = []
    base = add_pose(Q(neck=(-5, 0, 0), head=(5, 0, 0), tail1=(-10, 0, 0), tail2=(-10, 0, 0)), style.get('stance', {}))

    def idle(t):
        p = TAU * t / (2.6 * w)
        pose = add_pose(base, Q(chest=(1.5 * math.sin(p), 0, 0), head=(2 * math.sin(p * 0.5), 0, 6 * math.sin(p * 0.35)),
                                tail1=(0, 0, 14 * math.sin(p)), tail2=(0, 0, 18 * math.sin(p + 0.8))))
        return pose, (0, 0, 0.006 * h * math.sin(p))
    out.append(Clip('idle', 2.6 * w, idle, loop=True))

    def walk(t, T):
        p = TAU * t / T
        s = math.sin(p)
        c = math.cos(p)
        pose = add_pose(base, legs(-stride * s, stride * s, stride * s, -stride * s,
                                   max(0, c), max(0, -c), max(0, -c), max(0, c)))
        pose = add_pose(pose, Q(chest=(0, 0, 3 * s), hips=(0, 0, -3 * s), head=(0, 0, -2 * s),
                                tail1=(0, 0, 10 * s), tail2=(0, 0, 14 * s)))
        return pose, (0, 0, 0.012 * h * math.cos(2 * p))
    wt = 1.1 * w
    out.append(Clip('walk', wt, lambda t: walk(t, wt), loop=True))

    def run(t, T):
        # Rotary gallop: fronts then backs, with the spine flexing.
        p = TAU * t / T
        a = 1.5 * stride
        f = math.sin(p)
        b = math.sin(p - 2.2)
        pose = add_pose(base, legs(-a * f, -a * math.sin(p - 0.5), -a * b, -a * math.sin(p - 2.7),
                                   max(0, math.cos(p)), max(0, math.cos(p - 0.5)), max(0, math.cos(p - 2.2)), max(0, math.cos(p - 2.7))))
        pose = add_pose(pose, Q(spine=(9 * math.sin(p - 1.1), 0, 0), chest=(7 * math.sin(p - 1.1), 0, 0),
                                neck=(-8 * math.sin(p - 0.4), 0, 0), tail1=(18 * math.sin(p), 0, 0)))
        return pose, (0, 0, 0.05 * h * max(0, math.sin(2 * p - 0.6)))
    rt = 0.62 * w
    out.append(Clip('run', rt, lambda t: run(t, rt), loop=True))

    def attack(name, keys, hit, seconds):
        ks = [(k[0] * w, k[1], k[2] if len(k) > 2 else (0, 0, 0)) for k in keys]
        out.append(Clip(name, seconds * w, lambda t, ks=ks: keyed(ks, t), events={'hit': round(hit * w, 3)}))

    bite_wind = add_pose(base, Q(neck=(-35, 0, 0), head=(-20, 0, 0), jaw=(0, 0, 0), chest=(-6, 0, 0),
                                 backleg_L=(-10, 0, 0), backleg_R=(-10, 0, 0)))
    bite = add_pose(base, Q(neck=(16, 0, 0), head=(8, 0, 0), jaw=(35, 0, 0), chest=(10, 0, 0),
                            frontleg_L=(20, 0, 0), frontleg_R=(20, 0, 0), backleg_L=(-20, 0, 0), backleg_R=(-20, 0, 0)))
    attack('attack_bite', [(0, base), (0.4, bite_wind, (0, 0, 0.02 * h)), (0.55, bite, (0, 0, -0.04 * h)),
                           (0.8, bite, (0, 0, -0.04 * h)), (1.1, base)], 0.5, 1.1)

    swipe_wind = add_pose(base, Q(chest=(-12, 0, -20), frontleg_L=(-80, -40, 0), frontshin_L=(-60, 0, 0), neck=(-10, 0, 10),
                                  frontleg_R=(10, 0, 0)))
    swipe = add_pose(base, Q(chest=(12, 0, 25), frontleg_L=(-60, 30, 40), frontshin_L=(-10, 0, 0), neck=(10, 0, -10),
                             frontleg_R=(10, 0, 0)))
    attack('attack_swipe', [(0, base), (0.42, swipe_wind, (0, 0, 0.08 * h)), (0.56, swipe, (0, 0, 0)),
                            (0.8, swipe), (1.15, base)], 0.5, 1.15)
    swipe_wind_r = add_pose(base, Q(chest=(-12, 0, 20), frontleg_R=(-80, 40, 0), frontshin_R=(-60, 0, 0), neck=(-10, 0, -10)))
    swipe_r = add_pose(base, Q(chest=(12, 0, -25), frontleg_R=(-60, -30, -40), frontshin_R=(-10, 0, 0), neck=(10, 0, 10)))
    attack('attack_swipe_r', [(0, base), (0.42, swipe_wind_r, (0, 0, 0.08 * h)), (0.56, swipe_r),
                              (0.8, swipe_r), (1.15, base)], 0.5, 1.15)

    crouch = add_pose(base, Q(backleg_L=(-25, 0, 0), backleg_R=(-25, 0, 0), backshin_L=(50, 0, 0), backshin_R=(50, 0, 0),
                              frontleg_L=(15, 0, 0), frontleg_R=(15, 0, 0), frontshin_L=(-30, 0, 0), frontshin_R=(-30, 0, 0),
                              spine=(-8, 0, 0), neck=(-15, 0, 0)))
    leap = add_pose(base, Q(frontleg_L=(-70, 0, 0), frontleg_R=(-70, 0, 0), backleg_L=(50, 0, 0), backleg_R=(50, 0, 0),
                            backshin_L=(10, 0, 0), backshin_R=(10, 0, 0), spine=(-8, 0, 0), neck=(-20, 0, 0), tail1=(20, 0, 0)))
    land = add_pose(base, Q(frontleg_L=(-20, 0, 0), frontleg_R=(-20, 0, 0), frontshin_L=(-40, 0, 0), frontshin_R=(-40, 0, 0),
                            spine=(10, 0, 0), neck=(20, 0, 0), backleg_L=(-15, 0, 0), backleg_R=(-15, 0, 0)))
    attack('attack_pounce', [(0, base), (0.45, crouch, (0, 0, -0.18 * h)), (0.75, leap, (0, 0, 0.55 * h)),
                             (0.95, land, (0, 0, -0.12 * h)), (1.3, land, (0, 0, -0.1 * h)), (1.7, base)], 0.95, 1.7)

    rear = add_pose(base, Q(hips=(-24, 0, 0), frontleg_L=(-70, 0, 0), frontleg_R=(-40, 0, 0), frontshin_L=(-80, 0, 0),
                            frontshin_R=(-80, 0, 0), backleg_L=(30, 0, 0), backleg_R=(30, 0, 0), neck=(-15, 0, 0), head=(-10, 0, 0)))
    stomp = add_pose(base, Q(hips=(8, 0, 0), frontleg_L=(-15, 0, 0), frontleg_R=(-15, 0, 0), neck=(20, 0, 0), head=(10, 0, 0),
                             backleg_L=(-10, 0, 0), backleg_R=(-10, 0, 0)))
    attack('attack_stomp', [(0, base), (0.55, rear, (0, 0, 0.1 * h)), (0.75, stomp, (0, 0, -0.03 * h)),
                            (1.05, stomp), (1.45, base)], 0.72, 1.45)

    roar = add_pose(base, Q(neck=(-30, 0, 0), head=(-30, 0, 0), jaw=(45, 0, 0), chest=(-10, 0, 0), tail1=(-35, 0, 0), tail2=(-25, 0, 0),
                            frontleg_L=(-8, 0, 0), frontleg_R=(-8, 0, 0)))

    def roar_fn(t):
        pose, root = keyed([(0, base), (0.45, roar), (1.6, roar), (2.0, base)], t)
        if 0.45 < t < 1.6:
            pose = add_pose(pose, Q(head=(0, 0, 3 * math.sin(t * 55))))
        return pose, root
    out.append(Clip('roar', 2.0, roar_fn, events={'hit': 0.5}))

    hit = add_pose(base, Q(neck=(-20, 0, 12), head=(-10, 0, 10), chest=(-6, 0, 6), spine=(0, 0, 6)))
    out.append(Clip('hit', 0.45, lambda t: keyed([(0, base), (0.1, hit), (0.45, base)], t, ease_out)))
    stag = add_pose(base, Q(neck=(25, 0, 0), head=(20, 0, 0), frontleg_L=(20, 0, 0), frontleg_R=(20, 0, 0),
                            frontshin_L=(-70, 0, 0), frontshin_R=(-70, 0, 0), backleg_L=(-10, 0, 0), backleg_R=(-10, 0, 0)))
    out.append(Clip('stagger', 1.4 * w, lambda t: keyed([(0, base), (0.25 * w, stag, (0, 0, -0.2 * h)),
                                                         (1.0 * w, stag, (0, 0, -0.2 * h)), (1.4 * w, base)], t)))
    dead = add_pose(base, Q(hips=(0, 85, 0), neck=(-20, 0, 0), head=(-10, 0, 0), frontleg_L=(-30, 0, 0), frontleg_R=(20, 0, 0),
                            backleg_L=(-20, 0, 0), backleg_R=(30, 0, 0), tail1=(0, 0, 30)))
    out.append(Clip('death', 1.6, lambda t: keyed([(0, base), (0.35, stag, (0, 0, -0.2 * h)), (1.1, dead, (0, 0, -0.35 * h)),
                                                   (1.6, dead, (0, 0, -0.38 * h))], t)))
    return out

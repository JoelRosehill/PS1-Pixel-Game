"""Red dragon clips: flight (flap, glide, hover, dive, breath), ground (idle, walk, bite,
claw, tail sweep, wing buffet, roar), transitions (takeoff, land) and reactions.

Uses the source rig's own bone names after the IK targets are re-parented into FK
chains (see build.build_dragon). Facing -Y, left wing on +X. For a wing pointing out,
`-Y` about armature axes raises the left wing and `+Y` raises the right one; `+Z`
sweeps the left wing back and `-Z` sweeps the right one back.
"""
import math

from forge import Clip, add_pose, keyed

TAU = math.pi * 2
TAIL = [f'tail{i}' for i in range(1, 15)]
NECK = ['neck1', 'neck2', 'neck3', 'neck4', 'neck5']


def D(**bones):
    return {k.replace('_L', '.L').replace('_R', '.R'): v for k, v in bones.items()}


def wings(up, lower=None, sweep=0.0, fold=0.0):
    """up: degrees the wings are raised; lower: lower-wing bend; sweep/fold: backward."""
    lower = up * 0.6 if lower is None else lower
    pose = D(upperWing_L=(0, -up, sweep), upperWing_R=(0, up, -sweep),
             lowerWing_L=(0, -lower, sweep * 0.5 + fold), lowerWing_R=(0, lower, -sweep * 0.5 - fold))
    if fold:
        k = fold / 100.0
        for s, sg in (('L', 1), ('R', -1)):
            for f in ('wingMiddle1', 'wingPointer1', 'wingRing1'):
                pose[f'{f}.{s}'] = (0, 0, sg * 60 * k)
            pose[f'wingPinky1.{s}'] = (0, 0, sg * 30 * k)
    return pose


def wave(bones, t, speed, amp_x=0.0, amp_z=0.0, lag=0.5, grow=1.0):
    out = {}
    for i, b in enumerate(bones):
        k = grow ** i
        out[b] = (amp_x * k * math.sin(speed * t - i * lag), 0, amp_z * k * math.sin(speed * t - i * lag + 0.7))
    return out


TUCK = D(thigh_L=(55, 0, 0), thigh_R=(55, 0, 0), lowerLeg_L=(-40, 0, 0), lowerLeg_R=(-40, 0, 0),
         ankle_L=(50, 0, 0), ankle_R=(50, 0, 0), upperArm_L=(40, 0, 0), upperArm_R=(40, 0, 0),
         forearm_L=(-60, 0, 0), forearm_R=(-60, 0, 0))
DANGLE = D(thigh_L=(-15, 0, 0), thigh_R=(-15, 0, 0), lowerLeg_L=(20, 0, 0), lowerLeg_R=(20, 0, 0),
           upperArm_L=(-25, 0, 0), upperArm_R=(-25, 0, 0), forearm_L=(-30, 0, 0), forearm_R=(-30, 0, 0))
FOLDED = wings(-18, -30, sweep=55, fold=100)


def flap_pose(t, period, amp, pitch=0.0, legs=TUCK, extra=None):
    p = TAU * t / period
    up = amp * math.sin(p)
    lower = amp * 0.7 * math.sin(p - 0.8)
    pose = add_pose(wings(up, lower, sweep=6 * math.cos(p)), legs)
    pose = add_pose(pose, wave(TAIL, t, TAU / period * 0.5, amp_x=3, amp_z=4, lag=0.35))
    pose = add_pose(pose, wave(NECK, t, TAU / period, amp_x=2.5, lag=0.4))
    pose = add_pose(pose, D(pelvis=(pitch + 3 * math.sin(p + 1.2), 0, 0)))
    if extra:
        pose = add_pose(pose, extra)
    return pose, (0, 0, -0.06 * math.sin(p))


def clips(scale):
    """scale: metres per rig unit (for root bobs)."""
    s = scale
    out = []
    ground_body = D(neck1=(-8, 0, 0), neck2=(-6, 0, 0), head=(12, 0, 0))
    ground_base = add_pose(FOLDED, ground_body)

    # --- flight ---------------------------------------------------------------------
    out.append(Clip('fly', 1.1, lambda t: flap_pose(t, 1.1, 42), loop=True))

    def glide(t):
        p = TAU * t / 3.3
        pose = add_pose(wings(-6 + 4 * math.sin(p), -8), TUCK)
        pose = add_pose(pose, wave(TAIL, t, TAU / 3.3, amp_x=2, amp_z=6, lag=0.3))
        pose = add_pose(pose, D(pelvis=(2 * math.sin(p), 4 * math.sin(p * 0.5), 0)))
        return pose, (0, 0, 0.04 * s * math.sin(p))
    out.append(Clip('glide', 3.3, glide, loop=True))
    out.append(Clip('hover', 0.9, lambda t: flap_pose(t, 0.9, 55, pitch=-28, legs=DANGLE,
                                                      extra=D(neck1=(18, 0, 0), neck2=(10, 0, 0), head=(-15, 0, 0))), loop=True))

    def dive(t):
        pose = add_pose(wings(-20, -35, sweep=45, fold=40), TUCK)
        pose = add_pose(pose, D(pelvis=(20, 0, 0)))
        pose = add_pose(pose, wave(TAIL, t, 9, amp_z=3))
        return pose, (0, 0, 0)
    out.append(Clip('dive', 1.0, dive, loop=True))

    breath_head = D(neck1=(25, 0, 0), neck2=(18, 0, 0), neck3=(8, 0, 0), head=(-5, 0, 0), jaw=(40, 0, 0))

    def breath_air(t):
        wind = min(1, t / 0.7)
        pose, root = flap_pose(t, 0.9, 50, pitch=-24, legs=DANGLE)
        coil = D(neck1=(-30, 0, 0), neck2=(-20, 0, 0), head=(25, 0, 0))
        head = coil if t < 0.6 else breath_head
        k = wind if t < 0.6 else 1 - max(0, (t - 2.3) / 0.4)
        pose = add_pose(pose, head, k)
        if 0.7 < t < 2.3:
            pose = add_pose(pose, D(neck3=(0, 0, 18 * math.sin((t - 0.7) * 2.2)), head=(0, 0, 10 * math.sin((t - 0.7) * 2.2))))
        return pose, root
    out.append(Clip('breath_air', 2.7, breath_air, events={'hit': 0.7, 'end': 2.3}))

    # --- ground ---------------------------------------------------------------------
    def idle(t):
        p = TAU * t / 3.4
        pose = add_pose(ground_base, D(chest=(2 * math.sin(p), 0, 0), head=(0, 0, 10 * math.sin(p * 0.5)),
                                       neck3=(0, 0, 6 * math.sin(p * 0.5 - 0.6))))
        pose = add_pose(pose, wave(TAIL, t, TAU / 3.4, amp_z=2.2, lag=0.3))
        return pose, (0, 0, 0.01 * s * math.sin(p))
    out.append(Clip('idle', 3.4, idle, loop=True))

    def walk(t, T=1.6, stride=24):
        p = TAU * t / T
        sn, c = math.sin(p), math.cos(p)
        legs = D(upperArm_L=(-stride * sn, 0, 0), upperArm_R=(stride * sn, 0, 0),
                 thigh_L=(stride * sn, 0, 0), thigh_R=(-stride * sn, 0, 0),
                 forearm_L=(-25 * max(0, c), 0, 0), forearm_R=(-25 * max(0, -c), 0, 0),
                 lowerLeg_L=(30 * max(0, -c), 0, 0), lowerLeg_R=(30 * max(0, c), 0, 0))
        pose = add_pose(add_pose(ground_base, legs), D(chest=(0, 0, 4 * sn), pelvis=(0, 0, -3 * sn)))
        pose = add_pose(pose, wave(TAIL, t, TAU / T, amp_z=3, lag=0.35))
        pose = add_pose(pose, wave(NECK, t, TAU / T, amp_z=2, lag=0.3))
        return pose, (0, 0, 0.02 * s * abs(math.cos(p)))
    out.append(Clip('walk', 1.6, walk, loop=True))
    out.append(Clip('run', 0.9, lambda t: walk(t, 0.9, 34), loop=True))

    def attack(name, keys, hit, seconds, events=None):
        ev = {'hit': hit}
        ev.update(events or {})
        out.append(Clip(name, seconds, lambda t, ks=keys: keyed(ks, t), events=ev))

    bite_w = add_pose(ground_base, D(neck1=(-25, 0, 0), neck2=(-20, 0, 0), head=(20, 0, 0), chest=(-6, 0, 0)))
    bite = add_pose(ground_base, D(neck1=(20, 0, 0), neck2=(14, 0, 0), neck3=(6, 0, 0), head=(-10, 0, 0), jaw=(35, 0, 0),
                                   chest=(8, 0, 0), upperArm_L=(15, 0, 0), upperArm_R=(15, 0, 0)))
    attack('attack_bite', [(0, ground_base), (0.45, bite_w), (0.6, bite), (0.9, bite), (1.3, ground_base)], 0.56, 1.3)

    claw_w = add_pose(ground_base, D(pelvis=(-12, 0, 0), upperArm_R=(-80, 30, 0), forearm_R=(-50, 0, 0), chest=(0, 0, 15),
                                     neck2=(0, 0, 10)))
    claw = add_pose(ground_base, D(pelvis=(-6, 0, 0), upperArm_R=(-40, -30, -30), forearm_R=(10, 0, 0), chest=(8, 0, -25),
                                   neck2=(0, 0, -15)))
    attack('attack_claw', [(0, ground_base), (0.5, claw_w, (0, 0, 0.05 * s)), (0.66, claw), (0.95, claw), (1.35, ground_base)], 0.6, 1.35)

    def tail_keys(sign):
        wind = add_pose(ground_base, D(pelvis=(0, 0, 25 * sign), chest=(0, 0, 15 * sign)))
        wind = add_pose(wind, {b: (0, 0, -8 * sign) for b in TAIL})
        sweep = add_pose(ground_base, D(pelvis=(0, 0, -70 * sign), chest=(0, 0, -30 * sign)))
        sweep = add_pose(sweep, {b: (0, 0, 10 * sign) for b in TAIL})
        return [(0, ground_base), (0.55, wind), (0.85, sweep), (1.15, sweep), (1.7, ground_base)]
    attack('attack_tail', tail_keys(1), 0.72, 1.7)

    buffet_w = add_pose(add_pose(ground_body, wings(40, 20, sweep=-10)), D(pelvis=(-18, 0, 0), neck1=(-10, 0, 0)))
    buffet = add_pose(wings(-35, -10, sweep=-15), D(pelvis=(-10, 0, 0), neck1=(10, 0, 0), head=(-10, 0, 0), jaw=(30, 0, 0)))
    attack('attack_buffet', [(0, ground_base), (0.6, buffet_w, (0, 0, 0.1 * s)), (0.85, buffet, (0, 0, 0.05 * s)),
                             (1.2, buffet), (1.7, ground_base)], 0.8, 1.7)

    breath_ground = add_pose(ground_base, breath_head)

    def breath_ground_fn(t):
        coil = add_pose(ground_base, D(neck1=(-30, 0, 0), neck2=(-25, 0, 0), head=(25, 0, 0), pelvis=(-8, 0, 0)))
        pose, root = keyed([(0, ground_base), (0.7, coil), (0.85, breath_ground), (2.4, breath_ground), (2.9, ground_base)], t)
        if 0.85 < t < 2.4:
            pose = add_pose(pose, D(neck2=(0, 0, 22 * math.sin((t - 0.85) * 2.4)), head=(0, 0, 12 * math.sin((t - 0.85) * 2.4))))
        return pose, root
    out.append(Clip('breath', 2.9, breath_ground_fn, events={'hit': 0.85, 'end': 2.4}))

    roar = add_pose(add_pose(ground_body, wings(30, 10, sweep=-10)),
                    D(pelvis=(-26, 0, 0), neck1=(-20, 0, 0), neck2=(-15, 0, 0), head=(-25, 0, 0), jaw=(45, 0, 0),
                      upperArm_L=(-40, 0, 0), upperArm_R=(-40, 0, 0), thigh_L=(20, 0, 0), thigh_R=(20, 0, 0)))

    def roar_fn(t):
        pose, root = keyed([(0, ground_base), (0.6, roar, (0, 0, 0.15 * s)), (2.0, roar, (0, 0, 0.15 * s)), (2.6, ground_base)], t)
        if 0.6 < t < 2.0:
            pose = add_pose(pose, D(head=(0, 0, 3 * math.sin(t * 50))))
        return pose, root
    out.append(Clip('roar', 2.6, roar_fn, events={'hit': 0.7}))

    # --- transitions and reactions --------------------------------------------------------
    def takeoff(t):
        if t < 0.5:
            crouch = add_pose(ground_base, D(thigh_L=(-20, 0, 0), thigh_R=(-20, 0, 0), lowerLeg_L=(40, 0, 0), lowerLeg_R=(40, 0, 0),
                                             pelvis=(-10, 0, 0)))
            pose, _ = keyed([(0, ground_base), (0.5, crouch)], t)
            return pose, (0, 0, -0.1 * s * t / 0.5)
        pose, root = flap_pose(t - 0.5, 0.8, 58, pitch=-25, legs=DANGLE)
        return pose, root
    out.append(Clip('takeoff', 1.7, takeoff, events={'hit': 0.55}))

    def land(t):
        if t < 0.8:
            return flap_pose(t, 0.8, 50, pitch=-25, legs=DANGLE)
        k = min(1, (t - 0.8) / 0.6)
        pose, _ = keyed([(0, flap_pose(0.8, 0.8, 50, pitch=-25, legs=DANGLE)[0]), (1, ground_base)], k)
        return pose, (0, 0, -0.08 * s * math.sin(math.pi * k))
    out.append(Clip('land', 1.6, land, events={'hit': 1.0}))

    hit = add_pose(ground_base, D(neck1=(-15, 0, 12), head=(-10, 0, 10), pelvis=(0, 0, 6)))
    out.append(Clip('hit', 0.5, lambda t: keyed([(0, ground_base), (0.12, hit), (0.5, ground_base)], t)))
    stagger = add_pose(ground_base, D(pelvis=(12, 0, 0), neck1=(25, 0, 0), neck2=(15, 0, 0), head=(10, 0, 0),
                                      upperArm_L=(30, 0, 0), upperArm_R=(30, 0, 0), forearm_L=(-40, 0, 0), forearm_R=(-40, 0, 0)))
    out.append(Clip('stagger', 2.2, lambda t: keyed([(0, ground_base), (0.3, stagger, (0, 0, -0.12 * s)),
                                                     (1.8, stagger, (0, 0, -0.12 * s)), (2.2, ground_base)], t)))
    dead = add_pose(wings(-10, -20, sweep=20), D(pelvis=(0, 70, 0), neck1=(10, 0, 20), neck2=(10, 0, 20), neck3=(5, 0, 20), head=(0, 0, 15),
                                                  jaw=(25, 0, 0), thigh_L=(-30, 0, 0), upperArm_L=(-30, 0, 0)))
    out.append(Clip('death', 3.0, lambda t: keyed([(0, ground_base), (0.5, stagger, (0, 0, -0.12 * s)), (1.3, roar, (0, 0, 0.1 * s)),
                                                   (2.4, dead, (0, 0, -0.25 * s)), (3.0, dead, (0, 0, -0.28 * s))], t)))
    return out

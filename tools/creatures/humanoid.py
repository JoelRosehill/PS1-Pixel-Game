"""Humanoid clip library (armature-axis rotations, see forge.py for the conventions).

Canonical bones: hips, spine, chest, neck, head, shoulder.L/R, upperarm.L/R,
forearm.L/R, hand.L/R, thigh.L/R, shin.L/R, foot.L/R. Missing bones are ignored.

`style` tunes the same clips into different fighters:
  stance   extra rotations for the neutral pose (e.g. a raised sword arm)
  hunch    forward lean in degrees
  weight   0.6 (light, quick) .. 1.4 (heavy, slow); scales timing and amplitude
  arms     'weapon' (right hand leads), 'claws' (both arms strike), 'staff' (caster)
  wide     stance width in degrees (legs apart)
"""
import math

from forge import Clip, add_pose, blend_pose, ease_in, ease_out, keyed, lerp, smooth

TAU = math.pi * 2


def P(**bones):
    """Pose helper: P(thigh_L=(x, y, z)) -> {'thigh.L': (x, y, z)}."""
    return {k.replace('_L', '.L').replace('_R', '.R'): v for k, v in bones.items()}


def base_stance(style):
    wide = style.get('wide', 6)
    hunch = style.get('hunch', 0)
    pose = P(
        spine=(hunch * 0.5, 0, 0), chest=(hunch * 0.5, 0, 0), neck=(-hunch * 0.4, 0, 0), head=(-hunch * 0.3, 0, 0),
        thigh_L=(-8, -wide, 0), thigh_R=(-8, wide, 0), shin_L=(16, 0, 0), shin_R=(16, 0, 0),
        foot_L=(-8, wide * 0.6, 0), foot_R=(-8, -wide * 0.6, 0),
        upperarm_L=(8, 14, 0), upperarm_R=(8, -14, 0), forearm_L=(-24, 0, 0), forearm_R=(-24, 0, 0),
    )
    return add_pose(pose, style.get('stance', {}))


def crouch(k):
    """Knees bend by k (0..1) with the hips dropping to match."""
    return P(thigh_L=(-35 * k, 0, 0), thigh_R=(-35 * k, 0, 0), shin_L=(65 * k, 0, 0), shin_R=(65 * k, 0, 0),
             foot_L=(-30 * k, 0, 0), foot_R=(-30 * k, 0, 0))


def gait(p, amp, knee, arm, lean, bob, height, style):
    s, c = math.sin(p), math.cos(p)
    base = base_stance(style)
    swing = P(
        thigh_L=(-amp * s, 0, 0), thigh_R=(amp * s, 0, 0),
        shin_L=(knee * max(0.0, c) ** 1.5, 0, 0), shin_R=(knee * max(0.0, -c) ** 1.5, 0, 0),
        foot_L=(amp * 0.35 * s - knee * 0.25 * max(0.0, c), 0, 0), foot_R=(-amp * 0.35 * s - knee * 0.25 * max(0.0, -c), 0, 0),
        spine=(lean * 0.5, 0, 4 * s), chest=(lean * 0.5, 0, -7 * s),
        hips=(0, 0, -5 * s),
        head=(-lean * 0.6, 0, 3 * s),
    )
    if style.get('arms') == 'claws':
        swing = add_pose(swing, P(upperarm_L=(arm * s, 0, 0), upperarm_R=(-arm * s, 0, 0)))
    elif style.get('arms') == 'staff':
        swing = add_pose(swing, P(upperarm_L=(arm * 0.6 * s, 0, 0)))
    else:
        swing = add_pose(swing, P(upperarm_L=(arm * s, 0, 0), upperarm_R=(-arm * 0.35 * s, 0, 0)))
    pose = add_pose(base, swing)
    return pose, (0, 0, -bob * height * (0.5 - 0.5 * math.cos(2 * p)))


def clips(style):
    w = style.get('weight', 1.0)
    h = style.get('height', 2.0)
    base = base_stance(style)
    arms = style.get('arms', 'weapon')
    out = []

    # --- locomotion -------------------------------------------------------------------
    def idle(t):
        p = TAU * t / (2.4 * w)
        breathe = math.sin(p)
        pose = add_pose(base, P(chest=(-2 * breathe, 0, 0), spine=(1.5 * breathe, 0, 0), head=(1.5 * breathe, 0, 2 * math.sin(p * 0.5)),
                                upperarm_L=(-2 * breathe, 0, 0), upperarm_R=(-2 * breathe, 0, 0)))
        return pose, (0, 0, -0.008 * h * (1 + breathe))
    out.append(Clip('idle', 2.4 * w, idle, loop=True))

    walk_t = 1.1 * (0.75 + 0.25 * w)
    out.append(Clip('walk', walk_t, lambda t: gait(TAU * t / walk_t, 26, 40, 22, 4 + style.get('hunch', 0) * 0.2, 0.025, h, style), loop=True))
    run_t = 0.72 * (0.8 + 0.2 * w)
    out.append(Clip('run', run_t, lambda t: gait(TAU * t / run_t, 42, 85, 38, 16, 0.05, h, style), loop=True))

    # --- attacks: (windup, strike, recover) key poses ----------------------------------
    def attack(name, keys, hit, seconds, easing=smooth):
        ks = [(k[0] * w, k[1], k[2] if len(k) > 2 else (0, 0, 0)) for k in keys]
        out.append(Clip(name, seconds * w, lambda t, ks=ks: keyed(ks, t, easing), events={'hit': round(hit * w, 3)}))

    if arms == 'claws':
        slash_windup = add_pose(base, P(chest=(-8, 0, -30), spine=(0, 0, -10), upperarm_R=(-40, 60, -30), forearm_R=(-70, 0, 0),
                                        upperarm_L=(-20, -10, 0)))
        slash_strike = add_pose(base, P(chest=(18, 0, 40), spine=(6, 0, 15), upperarm_R=(-85, -20, 70), forearm_R=(-15, 0, 0),
                                        hand_R=(0, 0, 20), thigh_L=(-20, 0, 0), shin_L=(25, 0, 0)))
        back_windup = add_pose(base, P(chest=(-8, 0, 30), spine=(0, 0, 10), upperarm_L=(-40, -60, 30), forearm_L=(-70, 0, 0)))
        back_strike = add_pose(base, P(chest=(18, 0, -40), spine=(6, 0, -15), upperarm_L=(-85, 20, -70), forearm_L=(-15, 0, 0),
                                       thigh_R=(-20, 0, 0), shin_R=(25, 0, 0)))
    else:
        slash_windup = add_pose(base, P(chest=(-6, 0, -38), spine=(0, 0, -12), upperarm_R=(-70, 70, -40), forearm_R=(-80, 0, 0),
                                        hand_R=(0, 0, -30), upperarm_L=(-30, -20, 0), forearm_L=(-40, 0, 0)))
        slash_strike = add_pose(base, P(chest=(14, 0, 45), spine=(6, 0, 16), upperarm_R=(-90, -10, 80), forearm_R=(-10, 0, 0),
                                        hand_R=(0, 0, 30), thigh_L=(-22, 0, 0), shin_L=(28, 0, 0), thigh_R=(10, 0, 0)))
        back_windup = add_pose(base, P(chest=(-4, 0, 40), spine=(0, 0, 12), upperarm_R=(-80, -30, 70), forearm_R=(-60, 0, 0),
                                       hand_R=(0, 0, 30)))
        back_strike = add_pose(base, P(chest=(12, 0, -42), spine=(5, 0, -14), upperarm_R=(-85, 60, -60), forearm_R=(-15, 0, 0),
                                       hand_R=(0, 0, -20), thigh_R=(-18, 0, 0), shin_R=(22, 0, 0)))

    attack('attack_slash', [(0, base), (0.42, slash_windup), (0.58, slash_strike), (0.85, slash_strike), (1.25, base)], 0.5, 1.25)
    attack('attack_backslash', [(0, base), (0.38, back_windup), (0.54, back_strike), (0.8, back_strike), (1.2, base)], 0.46, 1.2)

    over_windup = add_pose(base, P(spine=(-12, 0, 0), chest=(-18, 0, 0), upperarm_R=(-170, -10, 0), forearm_R=(-50, 0, 0),
                                   upperarm_L=(-170, 10, 0), forearm_L=(-50, 0, 0), head=(-10, 0, 0)))
    over_strike = add_pose(base, P(spine=(22, 0, 0), chest=(28, 0, 0), upperarm_R=(-55, 0, 0), forearm_R=(-5, 0, 0),
                                   upperarm_L=(-55, 0, 0), forearm_L=(-5, 0, 0), head=(10, 0, 0), thigh_L=(-35, 0, 0), shin_L=(45, 0, 0),
                                   thigh_R=(18, 0, 0), shin_R=(20, 0, 0)))
    attack('attack_overhead', [(0, base), (0.6, over_windup, (0, 0, 0.04 * h)), (0.78, over_strike, (0, 0, -0.1 * h)),
                               (1.15, over_strike, (0, 0, -0.1 * h)), (1.6, base)], 0.7, 1.6)

    thrust_windup = add_pose(base, P(chest=(-4, 0, -25), upperarm_R=(-40, -20, 0), forearm_R=(-110, 0, 0), thigh_R=(12, 0, 0),
                                     upperarm_L=(-60, -20, 0), forearm_L=(-30, 0, 0)))
    thrust_strike = add_pose(base, P(chest=(12, 0, 15), spine=(8, 0, 5), upperarm_R=(-92, 0, 10), forearm_R=(-4, 0, 0),
                                     thigh_L=(-40, 0, 0), shin_L=(40, 0, 0), thigh_R=(20, 0, 0)))
    attack('attack_thrust', [(0, base), (0.36, thrust_windup), (0.5, thrust_strike, (0, 0, -0.05 * h)),
                             (0.75, thrust_strike, (0, 0, -0.05 * h)), (1.1, base)], 0.44, 1.1)

    sweep_windup = add_pose(add_pose(base, crouch(0.5)), P(chest=(10, 0, -55), upperarm_R=(-40, 80, -30), forearm_R=(-30, 0, 0)))
    sweep_strike = add_pose(add_pose(base, crouch(0.6)), P(chest=(20, 0, 70), spine=(10, 0, 20), upperarm_R=(-70, -40, 90),
                                                           forearm_R=(-5, 0, 0)))
    attack('attack_sweep', [(0, base), (0.45, sweep_windup, (0, 0, -0.1 * h)), (0.62, sweep_strike, (0, 0, -0.14 * h)),
                            (0.9, sweep_strike, (0, 0, -0.14 * h)), (1.3, base)], 0.55, 1.3)

    leap_crouch = add_pose(add_pose(base, crouch(0.8)), P(chest=(20, 0, 0), upperarm_R=(-150, 0, 0), upperarm_L=(-150, 0, 0),
                                                         forearm_R=(-60, 0, 0), forearm_L=(-60, 0, 0)))
    leap_air = add_pose(base, P(chest=(-15, 0, 0), spine=(-10, 0, 0), upperarm_R=(-190, 0, 0), upperarm_L=(-190, 0, 0),
                                forearm_R=(-40, 0, 0), forearm_L=(-40, 0, 0), thigh_L=(-60, 0, 0), shin_L=(90, 0, 0), thigh_R=(-20, 0, 0),
                                shin_R=(70, 0, 0)))
    leap_land = add_pose(add_pose(base, crouch(0.9)), P(chest=(40, 0, 0), spine=(15, 0, 0), upperarm_R=(-60, 0, 0), upperarm_L=(-60, 0, 0),
                                                       forearm_R=(-5, 0, 0), forearm_L=(-5, 0, 0)))
    attack('attack_leap', [(0, base), (0.45, leap_crouch, (0, 0, -0.18 * h)), (0.8, leap_air, (0, 0, 0.9 * h)),
                           (1.05, leap_land, (0, 0, -0.2 * h)), (1.5, leap_land, (0, 0, -0.2 * h)), (2.0, base)],
           1.05, 2.0)

    # three-hit combo: slash, backslash, overhead
    attack('attack_combo', [(0, base), (0.35, slash_windup), (0.5, slash_strike), (0.72, back_windup), (0.86, back_strike),
                            (1.2, over_windup, (0, 0, 0.03 * h)), (1.38, over_strike, (0, 0, -0.1 * h)),
                            (1.7, over_strike, (0, 0, -0.1 * h)), (2.1, base)], 0.44, 2.1)

    # --- casting (both hands) --------------------------------------------------------------
    cast_gather = add_pose(base, P(chest=(-12, 0, 0), upperarm_L=(-60, -30, 20), upperarm_R=(-60, 30, -20), forearm_L=(-90, 0, 0),
                                   forearm_R=(-90, 0, 0), head=(-10, 0, 0)))
    cast_release = add_pose(base, P(chest=(12, 0, 0), spine=(5, 0, 0), upperarm_L=(-95, 10, -10), upperarm_R=(-95, -10, 10),
                                    forearm_L=(-5, 0, 0), forearm_R=(-5, 0, 0), thigh_L=(-18, 0, 0), shin_L=(20, 0, 0)))
    attack('cast', [(0, base), (0.55, cast_gather), (0.7, cast_release),
                    (1.0, cast_release), (1.35, base)], 0.66, 1.35)
    raise_sky = add_pose(base, P(chest=(-20, 0, 0), head=(-25, 0, 0), upperarm_L=(-170, -25, 0), upperarm_R=(-170, 25, 0),
                                 forearm_L=(-10, 0, 0), forearm_R=(-10, 0, 0)))
    attack('cast_sky', [(0, base), (0.6, raise_sky, (0, 0, 0.05 * h)), (1.0, raise_sky, (0, 0, 0.07 * h)), (1.5, base)], 0.8, 1.5)

    def channel(t):
        p = TAU * t / 1.2
        pose = add_pose(cast_gather, P(chest=(0, 0, 4 * math.sin(p)), upperarm_L=(5 * math.sin(p * 2), 0, 0),
                                       upperarm_R=(5 * math.sin(p * 2), 0, 0)))
        return pose, (0, 0, 0.02 * h * math.sin(p))
    out.append(Clip('cast_loop', 1.2, channel, loop=True))

    # --- defence and reactions ---------------------------------------------------------------
    guard = add_pose(add_pose(base, crouch(0.25)), P(upperarm_R=(-70, -20, 40), forearm_R=(-80, 0, 0), upperarm_L=(-60, 20, -30),
                                                     forearm_L=(-90, 0, 0), chest=(8, 0, 0)))
    out.append(Clip('block', 1.0, lambda t: (add_pose(guard, P(chest=(1.5 * math.sin(TAU * t), 0, 0))), (0, 0, -0.05 * h)), loop=True))

    hit_pose = add_pose(base, P(chest=(-22, 0, 10), spine=(-10, 0, 0), head=(-25, 0, -10), upperarm_L=(-20, -30, 0),
                                upperarm_R=(-20, 30, 0)))
    out.append(Clip('hit', 0.45, lambda t: keyed([(0, base), (0.1, hit_pose), (0.45, base)], t, ease_out)))

    stag = add_pose(add_pose(base, crouch(0.4)), P(chest=(-30, 0, 15), spine=(-15, 0, 0), head=(-30, 0, 0), upperarm_L=(-40, -60, 0),
                                                   upperarm_R=(-40, 60, 0), forearm_L=(-30, 0, 0), forearm_R=(-30, 0, 0)))
    kneel_hurt = add_pose(add_pose(base, crouch(0.9)), P(chest=(35, 0, 0), spine=(15, 0, 0), head=(20, 0, 0), upperarm_L=(-30, 0, 0),
                                                        upperarm_R=(-30, 0, 0)))
    out.append(Clip('stagger', 1.4 * w, lambda t: keyed([(0, base), (0.15 * w, stag, (0, 0, -0.05 * h)),
                                                         (0.5 * w, kneel_hurt, (0, 0, -0.28 * h)),
                                                         (1.0 * w, kneel_hurt, (0, 0, -0.28 * h)), (1.4 * w, base)], t)))

    dead = P(hips=(-80, 0, 10), spine=(-10, 0, 0), chest=(-10, 0, 0), head=(-20, 0, 25), upperarm_L=(-150, -40, 0),
             upperarm_R=(-130, 50, 0), forearm_L=(-20, 0, 0), forearm_R=(-40, 0, 0), thigh_L=(70, 0, -10), thigh_R=(60, 10, 0),
             shin_L=(10, 0, 0), shin_R=(40, 0, 0))
    out.append(Clip('death', 1.6, lambda t: keyed([(0, base), (0.25, stag, (0, 0.15 * h, -0.05 * h)),
                                                   (0.7, kneel_hurt, (0, 0.3 * h, -0.3 * h)),
                                                   (1.25, dead, (0, 0.55 * h, -0.4 * h)), (1.6, dead, (0, 0.6 * h, -0.42 * h))], t)))

    roar = add_pose(base, P(chest=(-25, 0, 0), spine=(-12, 0, 0), head=(-30, 0, 0), neck=(-10, 0, 0), upperarm_L=(-40, -70, 20),
                            upperarm_R=(-40, 70, -20), forearm_L=(-40, 0, 0), forearm_R=(-40, 0, 0), thigh_L=(-15, -8, 0),
                            thigh_R=(-15, 8, 0), shin_L=(25, 0, 0), shin_R=(25, 0, 0)))

    def roar_fn(t):
        pose, root = keyed([(0, base), (0.5, add_pose(base, crouch(0.3))), (0.8, roar), (1.8, roar), (2.2, base)], t)
        shake = 3 * math.sin(t * 60) if 0.8 < t < 1.8 else 0
        return add_pose(pose, P(head=(shake, 0, shake))), root
    out.append(Clip('roar', 2.2, roar_fn, events={'hit': 0.85}))

    dodge_pose = add_pose(add_pose(base, crouch(0.6)), P(chest=(-10, 0, 0), upperarm_L=(-30, -30, 0), upperarm_R=(-30, 30, 0)))
    out.append(Clip('dodge', 0.6, lambda t: keyed([(0, base), (0.15, dodge_pose, (0, 0, 0.1 * h)),
                                                   (0.4, dodge_pose, (0, 0, -0.12 * h)), (0.6, base)], t, ease_out)))

    # --- NPC --------------------------------------------------------------------------------
    def talk(t):
        p = TAU * t / 3.0
        pose = add_pose(base, P(upperarm_R=(-35 - 15 * math.sin(p), -10, 10), forearm_R=(-60 - 20 * math.sin(p * 2), 0, 0),
                                head=(3 * math.sin(p * 1.5), 0, 6 * math.sin(p)), chest=(0, 0, 3 * math.sin(p))))
        return pose, (0, 0, 0)
    out.append(Clip('talk', 3.0, talk, loop=True))
    kneel = add_pose(base, P(thigh_L=(-90, 0, 0), shin_L=(90, 0, 0), foot_L=(0, 0, 0), thigh_R=(0, 0, 0), shin_R=(100, 0, 0),
                             foot_R=(40, 0, 0), spine=(10, 0, 0), chest=(10, 0, 0), head=(15, 0, 0),
                             upperarm_L=(-40, 0, 0), forearm_L=(-40, 0, 0), upperarm_R=(-20, 0, 0)))
    out.append(Clip('kneel', 3.0, lambda t: (add_pose(kneel, P(chest=(2 * math.sin(TAU * t / 3), 0, 0))), (0, 0, -0.26 * h)), loop=True))
    return out

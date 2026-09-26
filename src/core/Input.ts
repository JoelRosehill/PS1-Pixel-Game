/**
 * Rebinding (Job 10): physical key → the default key whose meaning it takes over, or null
 * when a default key was moved to another action and is now unbound. Gameplay code keeps
 * asking for the default codes ('KeyF', 'Space'…); menus translate with `logicalCode`.
 */
const keymap = new Map<string, string | null>();

export function logicalCode(code: string): string | null {
  return keymap.has(code) ? keymap.get(code)! : code;
}

/** `bindings` and `defaults` map action ids to key codes. */
export function setKeyBindings(bindings: Record<string, string>, defaults: Record<string, string>): void {
  keymap.clear();
  const bound = new Set(Object.values(bindings));
  for (const action of Object.keys(defaults)) {
    const d = defaults[action], b = bindings[action] ?? d;
    if (b === d) continue;
    keymap.set(b, d);
    if (!bound.has(d)) keymap.set(d, null);
  }
}

/**
 * Keyboard + mouse state with pointer lock.
 * `pressed`/`released` are edge-triggered and cleared by `endFrame()`.
 * Keys use `KeyboardEvent.code` (layout independent: 'KeyW', 'Space', 'ShiftLeft'…).
 */
export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  private mouseButtons = new Set<number>();
  private mousePressedSet = new Set<number>();

  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  blocked = false;
  /** Screenshot and test runs never capture the mouse (headless locks come and go). */
  lockEnabled = true;

  clear(): void {
    this.down.clear(); this.pressedSet.clear(); this.releasedSet.clear();
    this.mouseButtons.clear(); this.mousePressedSet.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }

  takePressed(code: string): boolean {
    const pressed = this.pressedSet.has(code);
    this.pressedSet.delete(code);
    return pressed;
  }

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock(): void {
    if (!this.locked && this.lockEnabled) this.element.requestPointerLock?.();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  released(code: string): boolean {
    return this.releasedSet.has(code);
  }

  mouseDown(button = 0): boolean {
    return this.mouseButtons.has(button);
  }

  mousePressed(button = 0): boolean {
    return this.mousePressedSet.has(button);
  }

  /** -1..1 axis from two keys. */
  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /**
   * Mouse deltas are per-frame, but edge-triggered presses are only cleared once a
   * fixed step has actually consumed them. Hit-stop nearly freezes the fixed clock, and
   * that is exactly when players mash the next combo input — those must not be dropped.
   */
  endFrame(consumeEdges = true): void {
    if (consumeEdges) {
      this.pressedSet.clear();
      this.releasedSet.clear();
      this.mousePressedSet.clear();
    }
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.blocked) return;
    if (e.code.startsWith('F') && e.code.length <= 3) e.preventDefault();
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    const code = logicalCode(e.code);
    if (!code) return;
    if (!this.down.has(code)) this.pressedSet.add(code);
    this.down.add(code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const code = logicalCode(e.code);
    if (!code) return;
    this.down.delete(code);
    this.releasedSet.add(code);
  };

  private onBlur = () => {
    this.clear();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.blocked) return;
    this.mouseButtons.add(e.button);
    this.mousePressedSet.add(e.button);
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.blocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.blocked) return;
    this.wheel += Math.sign(e.deltaY);
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.element;
  };
}

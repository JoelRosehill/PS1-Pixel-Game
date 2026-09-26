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
    if (!this.locked) this.element.requestPointerLock?.();
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
    if (!this.down.has(e.code)) this.pressedSet.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
    this.releasedSet.add(e.code);
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

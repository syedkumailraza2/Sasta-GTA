/** Keyboard + pointer-lock mouse + typed-letter stream (for cheat codes). */
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private buttons = new Set<number>();
  private justClicked = new Set<number>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** letters typed since last frame (cheat codes) */
  typed = "";
  /** when false (menus), gameplay input is ignored but we still track state */
  enabled = true;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (/^Key[A-Z]$/.test(e.code)) this.typed += e.code.slice(3);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.buttons.clear(); });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    // pointer events, not mouse events: Babylon preventDefault()s pointerdown, which suppresses mousedown
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.justClicked.add(e.button);
    });
    window.addEventListener("pointerup", (e) => this.buttons.delete(e.button));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("wheel", (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  lock() {
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true } as never) as unknown as Promise<void> | undefined;
    p?.catch?.(() => this.canvas.requestPointerLock());
  }

  down(code: string) { return this.enabled && this.keys.has(code); }
  pressed(code: string) { return this.enabled && this.justPressed.has(code); }
  mouse(btn: number) { return this.enabled && this.buttons.has(btn); }
  clicked(btn: number) { return this.enabled && this.justClicked.has(btn); }

  /** call once per frame after consumers have read input */
  endFrame() {
    this.justPressed.clear();
    this.justClicked.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.typed = "";
  }
}

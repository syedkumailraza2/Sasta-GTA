export type Cheat = { code: string; desc: string; run: () => string | void };

/** GTA-style cheats: type the code while playing (no need to open anything). */
export class Cheats {
  private buffer = "";
  constructor(private list: Cheat[], private onActivate: (c: Cheat, msg: string) => void) {}

  get all() { return this.list; }

  feed(letters: string) {
    if (!letters) return;
    this.buffer = (this.buffer + letters).slice(-24);
    for (const c of this.list) {
      if (this.buffer.endsWith(c.code)) {
        this.buffer = "";
        const msg = c.run() || c.desc;
        this.onActivate(c, msg);
        return;
      }
    }
  }
}

// Distinguish a tap from a hold using event timestamps, including clicks that
// start and finish between rendered frames. Mouse and keyboard share one hold.
export const GUARD_TAP_MS = 180;
export class GuardInput {
  constructor() { this.reset(); }
  reset() { this.sources = new Set(); this.press = null; this.queued = false; }
  get held() { return this.sources.size > 0; }
  down(source, now, player) {
    if (this.sources.has(source)) return;
    if (!this.held) this.press = player.action === 'idle'
      ? { at: now, serial: player.actionSerial || 0, blocked: player.guardHitSerial || 0 } : null;
    this.sources.add(source);
  }
  up(source, now, player) {
    if (!this.sources.delete(source) || this.held) return;
    const press = this.press; this.press = null;
    if (press && now - press.at < GUARD_TAP_MS && player.action === 'idle'
      && press.serial === (player.actionSerial || 0) && press.blocked === (player.guardHitSerial || 0)) this.queued = true;
  }
  consume() { const queued = this.queued; this.queued = false; return queued; }
}

type BridgeStatus = {
  connected?: boolean;
  deviceName?: string | null;
  deviceAddress?: string | null;
};

type AndroidBridge = {
  bleStatus?: () => string;
  bleSendHex?: (hex: string) => string;
  bleDisconnect?: () => string;
  saveFamilyMembers?: (json: string) => string;
  getFamilyMembers?: () => string;
};

declare global {
  interface Window {
    AiroAndroidBridge?: AndroidBridge;
  }
}

export class NativeOllie {
  Motors = {
    off: 0x00,
    forward: 0x01,
    reverse: 0x02,
    brake: 0x03,
    ignore: 0x04,
  };

  leftMode = this.Motors.off;
  rightMode = this.Motors.off;
  leftSpeed = 0;
  rightSpeed = 0;
  leftPosition = 0;
  rightPosition = 0;
  heading = 0;
  leftMsPer360 = 1600;
  rightMsPer360 = 1600;
  sequence = 0;
  device: { name?: string | null; id?: string | null } | null = null;

  constructor() {
    const status = this.getBridgeStatus();
    this.device = {
      name: status?.deviceName || 'Airo Dock',
      id: status?.deviceAddress || null,
    };
  }

  static isAvailable() {
    return Boolean(window.AiroAndroidBridge?.bleStatus && window.AiroAndroidBridge?.bleSendHex);
  }

  static isConnected() {
    try {
      const raw = window.AiroAndroidBridge?.bleStatus?.();
      if (!raw) return false;
      const status = JSON.parse(raw) as BridgeStatus;
      return Boolean(status.connected);
    } catch (_error) {
      return false;
    }
  }

  private getBridgeStatus() {
    try {
      const raw = window.AiroAndroidBridge?.bleStatus?.();
      if (!raw) return null;
      return JSON.parse(raw) as BridgeStatus;
    } catch (_error) {
      return null;
    }
  }

  private ensureBridge() {
    if (!NativeOllie.isAvailable()) {
      throw new Error('android-ble-bridge-unavailable');
    }
  }

  private parseBridgeResponse(raw: string | undefined) {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { lastError?: string | null };
    } catch {
      return null;
    }
  }

  private async emitHex(hex: string) {
    this.ensureBridge();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = window.AiroAndroidBridge?.bleSendHex?.(hex);
      const parsed = this.parseBridgeResponse(response);
      const error = String(parsed?.lastError || '').trim().toLowerCase();
      if (!error) {
        return;
      }
      const transientGattIssue = error.includes('gatt-operation-failed') || error.includes('write-failed');
      if (!transientGattIssue || attempt >= 2) {
        throw new Error(String(parsed?.lastError || 'ble-write-failed'));
      }
      await this.sleep(45);
    }
  }

  private wrap360(value: number) {
    let next = Number(value) || 0;
    next %= 360;
    if (next < 0) next += 360;
    return next;
  }

  private shortestDelta(current: number, target: number) {
    let delta = target - current;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  private modeName(mode: number) {
    switch (mode) {
      case this.Motors.forward: return 'forward';
      case this.Motors.reverse: return 'reverse';
      case this.Motors.brake: return 'brake';
      case this.Motors.ignore: return 'ignore';
      default: return 'off';
    }
  }

  private dirToMode(dir: string) {
    return String(dir).toLowerCase().trim() === 'reverse' ? this.Motors.reverse : this.Motors.forward;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private async sendCommand(did: number, cid: number, bytes: number[]) {
    const seq = this.sequence & 0xff;
    this.sequence = (this.sequence + 1) & 0xff;

    let sop2 = 0xfc;
    sop2 |= 0x01;
    sop2 |= 0x02;

    const payload = bytes.map((value) => value & 0xff);
    const dlen = payload.length + 1;
    const sum = payload.reduce((acc, value) => acc + value, did + cid + seq + dlen);
    const chk = (sum & 0xff) ^ 0xff;
    const packet = [0xff, sop2, did & 0xff, cid & 0xff, seq, dlen, ...payload, chk];
    const hex = packet.map((value) => value.toString(16).padStart(2, '0')).join('');
    await this.emitHex(hex);
  }

  async request() {
    this.ensureBridge();
    return this.device;
  }

  async connect() {
    this.ensureBridge();
    if (!NativeOllie.isConnected()) {
      throw new Error('android-dock-not-connected');
    }
    return this.device;
  }

  async init() {
    this.ensureBridge();
  }

  async ensureConnected() {
    await this.connect();
  }

  async setRawMotors(leftMode: number, leftSpeed: number, rightMode: number, rightSpeed: number) {
    await this.ensureConnected();

    const lm = Math.max(0, Math.min(4, Number(leftMode) || 0)) & 0x07;
    const ls = Math.max(0, Math.min(255, Number(leftSpeed) || 0));
    const rm = Math.max(0, Math.min(4, Number(rightMode) || 0)) & 0x07;
    const rs = Math.max(0, Math.min(255, Number(rightSpeed) || 0));

    await this.sendCommand(0x02, 0x33, [lm, ls, rm, rs]);
    this.leftMode = lm;
    this.leftSpeed = ls;
    this.rightMode = rm;
    this.rightSpeed = rs;
  }

  async stopMotors() {
    await this.setRawMotors(this.Motors.off, 0, this.Motors.off, 0);
  }

  async spinLeftFor(dir: string, degrees: number, speed: number) {
    const mode = this.dirToMode(dir);
    const deg = Math.max(0, Number(degrees) || 0);
    const duration = (deg / 360) * this.leftMsPer360;
    await this.setRawMotors(mode, speed, this.rightMode, this.rightSpeed);
    await this.sleep(duration);
    await this.setRawMotors(this.Motors.off, 0, this.rightMode, this.rightSpeed);
    this.leftPosition = this.wrap360(this.leftPosition + (mode === this.Motors.forward ? deg : -deg));
  }

  async spinRightFor(dir: string, degrees: number, speed: number) {
    const mode = this.dirToMode(dir);
    const deg = Math.max(0, Number(degrees) || 0);
    const duration = (deg / 360) * this.rightMsPer360;
    await this.setRawMotors(this.leftMode, this.leftSpeed, mode, speed);
    await this.sleep(duration);
    await this.setRawMotors(this.leftMode, this.leftSpeed, this.Motors.off, 0);
    this.rightPosition = this.wrap360(this.rightPosition + (mode === this.Motors.forward ? deg : -deg));
  }

  async moveLeftToPosition(targetDegrees: number, speed: number) {
    const target = this.wrap360(targetDegrees);
    const delta = this.shortestDelta(this.leftPosition, target);
    if (Math.abs(delta) < 1) return;
    await this.spinLeftFor(delta >= 0 ? 'forward' : 'reverse', Math.abs(delta), speed);
    this.leftPosition = target;
  }

  async moveRightToPosition(targetDegrees: number, speed: number) {
    const target = this.wrap360(targetDegrees);
    const delta = this.shortestDelta(this.rightPosition, target);
    if (Math.abs(delta) < 1) return;
    await this.spinRightFor(delta >= 0 ? 'forward' : 'reverse', Math.abs(delta), speed);
    this.rightPosition = target;
  }

  async startupCalibration(leftMs: number, rightMs: number) {
    this.leftMsPer360 = Math.max(1, Number(leftMs) || 1600);
    this.rightMsPer360 = Math.max(1, Number(rightMs) || 1600);
    this.leftPosition = 0;
    this.rightPosition = 0;
    this.heading = 0;
  }

  async setLedColor(_red: number, _green: number, _blue: number) {
    // Native Android bridge does not expose dock light control yet.
  }

  setTrackedPositions(left: number, right: number) {
    this.leftPosition = this.wrap360(left);
    this.rightPosition = this.wrap360(right);
  }

  setHeading(heading: number) {
    this.heading = this.wrap360(heading);
  }

  getHeading() {
    return this.heading.toFixed(1);
  }

  getLeftDirection() {
    return this.modeName(this.leftMode);
  }

  getRightDirection() {
    return this.modeName(this.rightMode);
  }

  getLeftPosition() {
    return this.leftPosition.toFixed(1);
  }

  getRightPosition() {
    return this.rightPosition.toFixed(1);
  }

  getCalibrationText() {
    return `Left360:${this.leftMsPer360}ms Right360:${this.rightMsPer360}ms`;
  }

  async disconnect() {
    window.AiroAndroidBridge?.bleDisconnect?.();
  }
}

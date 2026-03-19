export class Config {
    radioService() { return "22bb746f-2bb0-7554-2d6f-726568705327"; }
    robotService() { return "22bb746f-2ba0-7554-2d6f-726568705327"; }
    controlCharacteristic() { return "22bb746f-2ba1-7554-2d6f-726568705327"; }
    antiDOSCharateristic() { return "22bb746f-2bbd-7554-2d6f-726568705327"; }
    powerCharateristic() { return "22bb746f-2bb2-7554-2d6f-726568705327"; }
    wakeUpCPUCharateristic() { return "22bb746f-2bbf-7554-2d6f-726568705327"; }
}

export class Ollie {
    device: BluetoothDevice | null = null;
    server: BluetoothRemoteGATTServer | null = null;
    controlChar: BluetoothRemoteGATTCharacteristic | null = null;
    config = new Config();
    sequence = 0;

    Motors = {
        off: 0x00,
        forward: 0x01,
        reverse: 0x02,
        brake: 0x03,
        ignore: 0x04
    };

    leftMode = this.Motors.off;
    rightMode = this.Motors.off;
    leftSpeed = 0;
    rightSpeed = 0;

    leftPosition = 0;
    rightPosition = 0;

    leftMsPer360 = 1600;
    rightMsPer360 = 1600;

    constructor() {
        this.onDisconnected = this.onDisconnected.bind(this);
    }

    _clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    _sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _wrap360(v: number) {
        v = Number(v) || 0;
        v = v % 360;
        if (v < 0) v += 360;
        return v;
    }

    _shortestDelta(current: number, target: number) {
        let d = target - current;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }

    _modeName(mode: number) {
        switch (mode) {
            case this.Motors.forward: return "forward";
            case this.Motors.reverse: return "reverse";
            case this.Motors.brake: return "brake";
            case this.Motors.off: return "off";
            case this.Motors.ignore: return "ignore";
            default: return "unknown";
        }
    }

    _dirToMode(dir: string) {
        const d = String(dir).toLowerCase().trim();
        if (d === "forward") return this.Motors.forward;
        if (d === "reverse") return this.Motors.reverse;
        return this.Motors.forward;
    }

    async request() {
        const options = {
            filters: [
                { services: [this.config.radioService()] },
                { services: [this.config.robotService()] }
            ],
            optionalServices: [this.config.radioService(), this.config.robotService()]
        };

        this.device = await navigator.bluetooth.requestDevice(options);
        this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
        return this.device;
    }

    async connect() {
        if (!this.device) throw new Error('Device is not connected.');
        this.server = await this.device.gatt!.connect();
        const service = await this.server.getPrimaryService(this.config.robotService());
        this.controlChar = await service.getCharacteristic(this.config.controlCharacteristic());
        return this.server;
    }

    async ensureConnected() {
        if (!this.server || !this.server.connected || !this.controlChar) {
            await this.connect();
        }
    }

    async init() {
        await this.ensureConnected();

        await this._writeCharacteristic(
            this.config.radioService(),
            this.config.antiDOSCharateristic(),
            new Uint8Array('011i3'.split('').map(c => c.charCodeAt(0)))
        );

        await this._writeCharacteristic(
            this.config.radioService(),
            this.config.powerCharateristic(),
            new Uint8Array([0x07])
        );

        await this._writeCharacteristic(
            this.config.radioService(),
            this.config.wakeUpCPUCharateristic(),
            new Uint8Array([0x01])
        );

        await this._sendCommand(0x02, 0x20, new Uint8Array([0x00, 0x80, 0xFF, 0x00]));
        await this.stopMotors();
    }

    async setRawMotors(leftMode: number, leftSpeed: number, rightMode: number, rightSpeed: number) {
        await this.ensureConnected();

        const lm = this._clamp(Number(leftMode) || 0, 0, 4) & 0x07;
        const ls = this._clamp(Number(leftSpeed) || 0, 0, 255);
        const rm = this._clamp(Number(rightMode) || 0, 0, 4) & 0x07;
        const rs = this._clamp(Number(rightSpeed) || 0, 0, 255);

        const data = new Uint8Array([lm, ls, rm, rs]);
        await this._sendCommand(0x02, 0x33, data);

        this.leftMode = lm;
        this.leftSpeed = ls;
        this.rightMode = rm;
        this.rightSpeed = rs;
    }

    async leftForward(speed: number) {
        return this.setRawMotors(this.Motors.forward, speed, this.rightMode, this.rightSpeed);
    }

    async leftReverse(speed: number) {
        return this.setRawMotors(this.Motors.reverse, speed, this.rightMode, this.rightSpeed);
    }

    async rightForward(speed: number) {
        return this.setRawMotors(this.leftMode, this.leftSpeed, this.Motors.forward, speed);
    }

    async rightReverse(speed: number) {
        return this.setRawMotors(this.leftMode, this.leftSpeed, this.Motors.reverse, speed);
    }

    async stopLeftMotor() {
        return this.setRawMotors(this.Motors.off, 0, this.rightMode, this.rightSpeed);
    }

    async stopRightMotor() {
        return this.setRawMotors(this.leftMode, this.leftSpeed, this.Motors.off, 0);
    }

    async stopMotors() {
        return this.setRawMotors(this.Motors.off, 0, this.Motors.off, 0);
    }

    async spinLeftFor(dir: string, degrees: number, speed: number) {
        const mode = this._dirToMode(dir);
        const deg = Math.max(0, Number(degrees) || 0);
        const spd = this._clamp(Number(speed) || 0, 0, 255);
        const duration = (deg / 360) * this.leftMsPer360;

        await this.setRawMotors(mode, spd, this.rightMode, this.rightSpeed);
        await this._sleep(duration);
        await this.setRawMotors(this.Motors.off, 0, this.rightMode, this.rightSpeed);

        if (mode === this.Motors.forward) {
            this.leftPosition = this._wrap360(this.leftPosition + deg);
        } else if (mode === this.Motors.reverse) {
            this.leftPosition = this._wrap360(this.leftPosition - deg);
        }
    }

    async spinRightFor(dir: string, degrees: number, speed: number) {
        const mode = this._dirToMode(dir);
        const deg = Math.max(0, Number(degrees) || 0);
        const spd = this._clamp(Number(speed) || 0, 0, 255);
        const duration = (deg / 360) * this.rightMsPer360;

        await this.setRawMotors(this.leftMode, this.leftSpeed, mode, spd);
        await this._sleep(duration);
        await this.setRawMotors(this.leftMode, this.leftSpeed, this.Motors.off, 0);

        if (mode === this.Motors.forward) {
            this.rightPosition = this._wrap360(this.rightPosition + deg);
        } else if (mode === this.Motors.reverse) {
            this.rightPosition = this._wrap360(this.rightPosition - deg);
        }
    }

    async moveLeftToPosition(targetDegrees: number, speed: number) {
        const target = this._wrap360(targetDegrees);
        const delta = this._shortestDelta(this.leftPosition, target);

        if (Math.abs(delta) < 1) return;

        const dir = delta >= 0 ? "forward" : "reverse";
        await this.spinLeftFor(dir, Math.abs(delta), speed);
        this.leftPosition = target;
    }

    async moveRightToPosition(targetDegrees: number, speed: number) {
        const target = this._wrap360(targetDegrees);
        const delta = this._shortestDelta(this.rightPosition, target);

        if (Math.abs(delta) < 1) return;

        const dir = delta >= 0 ? "forward" : "reverse";
        await this.spinRightFor(dir, Math.abs(delta), speed);
        this.rightPosition = target;
    }

    async startupCalibration(leftMs: number, rightMs: number, speed: number) {
        const l = Math.max(1, Number(leftMs) || 1600);
        const r = Math.max(1, Number(rightMs) || 1600);
        const s = this._clamp(Number(speed) || 120, 0, 255);

        this.leftMsPer360 = l;
        this.rightMsPer360 = r;

        this.leftPosition = 0;
        this.rightPosition = 0;

        // Left full turn
        await this.setRawMotors(this.Motors.forward, s, this.Motors.off, 0);
        await this._sleep(this.leftMsPer360);
        await this.setRawMotors(this.Motors.off, 0, this.Motors.off, 0);
        this.leftPosition = 0;

        await this._sleep(250);

        // Right full turn
        await this.setRawMotors(this.Motors.off, 0, this.Motors.forward, s);
        await this._sleep(this.rightMsPer360);
        await this.setRawMotors(this.Motors.off, 0, this.Motors.off, 0);
        this.rightPosition = 0;
    }

    setTrackedPositions(left: number, right: number) {
        this.leftPosition = this._wrap360(left);
        this.rightPosition = this._wrap360(right);
    }

    getLeftDirection() {
        return this._modeName(this.leftMode);
    }

    getRightDirection() {
        return this._modeName(this.rightMode);
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

    disconnect() {
        if (!this.device || !this.device.gatt) {
            return Promise.reject('Device is not connected.');
        }
        if (this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        return Promise.resolve();
    }

    onDisconnected() {
        this.server = null;
        this.controlChar = null;
    }

    async _sendCommand(did: number, cid: number, data: Uint8Array) {
        await this.ensureConnected();

        const seq = this.sequence & 0xFF;
        this.sequence = (this.sequence + 1) & 0xFF;

        let sop2 = 0xFC;
        sop2 |= 0x01;
        sop2 |= 0x02;

        const payload = data || new Uint8Array([]);
        const dlen = payload.byteLength + 1;
        const sum = payload.reduce((a, b) => a + b, 0) + did + cid + seq + dlen;
        const chk = (sum & 0xFF) ^ 0xFF;

        const header = new Uint8Array([0xFF, sop2, did, cid, seq, dlen]);
        const packet = new Uint8Array(header.byteLength + payload.byteLength + 1);
        packet.set(header, 0);
        packet.set(payload, header.byteLength);
        packet[packet.length - 1] = chk;

        await this.controlChar!.writeValue(packet);
    }

    async _writeCharacteristic(serviceUID: string, characteristicUID: string, value: Uint8Array) {
        await this.ensureConnected();
        const service = await this.server!.getPrimaryService(serviceUID);
        const characteristic = await service.getCharacteristic(characteristicUID);
        await characteristic.writeValue(value);
    }
}

export const ollie = new Ollie();

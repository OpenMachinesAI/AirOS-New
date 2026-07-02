export class ArduinoController {
  private port: any = null;
  private writer: any = null;

  public currentUltrasonic: number = 15;
  public currentLineFollower: number = 0;
  
  public leftSpeed: number = 0;
  public rightSpeed: number = 0;
  
  public leftFlipperPos: number = 90;
  public rightFlipperPos: number = 90;

  async request() {
    this.port = await (navigator as any).serial.requestPort();
    return this.port;
  }

  async connect() {
    if (!this.port) throw new Error("Device is not connected.");
    await this.port.open({ baudRate: 115200 });
    
    const encoder = new TextEncoderStream();
    encoder.readable.pipeTo(this.port.writable);
    this.writer = encoder.writable.getWriter();
    
    return this.port;
  }

  async init() {
     // Center flippers
     await this.setLeftFlipper(90);
     await this.setRightFlipper(90);
  }

  async sendCommand(cmd: string) {
    if (this.writer) {
      await this.writer.write(cmd + '\n');
    }
  }

  async setLeftFlipper(angle: number) {
     this.leftFlipperPos = Math.max(0, Math.min(180, angle));
     await this.sendCommand(`L:${this.leftFlipperPos}`);
  }

  async setRightFlipper(angle: number) {
     this.rightFlipperPos = Math.max(0, Math.min(180, angle));
     await this.sendCommand(`R:${this.rightFlipperPos}`);
  }

  // Compatibility methods for previous MBot/NXT logic
  async setMotorSpeeds(leftSpeed: number, rightSpeed: number) {
     this.leftSpeed = leftSpeed;
     this.rightSpeed = rightSpeed;
  }

  async leftForward(speed: number) { await this.setLeftFlipper(135); }
  async leftReverse(speed: number) { await this.setLeftFlipper(45); }
  async rightForward(speed: number) { await this.setRightFlipper(135); }
  async rightReverse(speed: number) { await this.setRightFlipper(45); }
  
  async stopLeftMotor() { await this.setLeftFlipper(90); }
  async stopRightMotor() { await this.setRightFlipper(90); }
  async stopMotors() {
    await this.setLeftFlipper(90);
    await this.setRightFlipper(90);
  }

  async spinLeftFor(dir: string, degrees: number, speed: number) {
      if (dir === 'forward') {
         await this.setLeftFlipper(135);
      } else {
         await this.setLeftFlipper(45);
      }
      await new Promise(r => setTimeout(r, 500));
      await this.setLeftFlipper(90);
  }

  async spinRightFor(dir: string, degrees: number, speed: number) {
      if (dir === 'forward') {
         await this.setRightFlipper(135);
      } else {
         await this.setRightFlipper(45);
      }
      await new Promise(r => setTimeout(r, 500));
      await this.setRightFlipper(90);
  }

  disconnect() {
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    return Promise.resolve();
  }
}

export const arduinoRobot = new ArduinoController();

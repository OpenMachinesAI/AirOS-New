import { Ollie } from './ollie';
import { NativeOllie } from './nativeOllie';

export type MobilityMotorSide = 'left' | 'right';
export type MobilityMotorDirection = 'forward' | 'reverse' | 'off';

export interface RobotMobilityController {
  request(): Promise<unknown>;
  connect(): Promise<unknown>;
  init(): Promise<void>;
  disconnect(): Promise<void>;
  stopMotion(): Promise<void>;
  setAccentColor(red: number, green: number, blue: number): Promise<void>;
  updateHeading(heading: number): void;
  driveMotorSide(side: MobilityMotorSide, direction: MobilityMotorDirection, speed: number): Promise<void>;
  rotateMotorSideFor(
    side: MobilityMotorSide,
    direction: Exclude<MobilityMotorDirection, 'off'>,
    degrees: number,
    speed: number,
  ): Promise<void>;
  rotateMotorSideToHeading(side: MobilityMotorSide, targetHeading: number, speed: number): Promise<void>;
}

type DockDriver = Ollie | NativeOllie;

export class DockMobilityController implements RobotMobilityController {
  constructor(private readonly driver: DockDriver) {}

  async request() {
    return this.driver.request();
  }

  async connect() {
    return this.driver.connect();
  }

  async init() {
    await this.driver.init();
  }

  async disconnect() {
    await this.driver.disconnect();
  }

  async stopMotion() {
    await this.driver.stopMotors();
  }

  async setAccentColor(red: number, green: number, blue: number) {
    await this.driver.setLedColor(red, green, blue);
  }

  updateHeading(heading: number) {
    this.driver.setHeading(heading);
  }

  async driveMotorSide(side: MobilityMotorSide, direction: MobilityMotorDirection, speed: number) {
    const mode = this.modeFromDirection(direction);
    if (side === 'left') {
      await this.driver.setRawMotors(mode, speed, this.driver.Motors.off, 0);
      return;
    }
    await this.driver.setRawMotors(this.driver.Motors.off, 0, mode, speed);
  }

  async rotateMotorSideFor(
    side: MobilityMotorSide,
    direction: Exclude<MobilityMotorDirection, 'off'>,
    degrees: number,
    speed: number,
  ) {
    if (side === 'left') {
      await this.driver.spinLeftFor(direction, degrees, speed);
      return;
    }
    await this.driver.spinRightFor(direction, degrees, speed);
  }

  async rotateMotorSideToHeading(side: MobilityMotorSide, targetHeading: number, speed: number) {
    if (side === 'left') {
      await this.driver.moveLeftToPosition(targetHeading, speed);
      return;
    }
    await this.driver.moveRightToPosition(targetHeading, speed);
  }

  private modeFromDirection(direction: MobilityMotorDirection) {
    switch (direction) {
      case 'forward':
        return this.driver.Motors.forward;
      case 'reverse':
        return this.driver.Motors.reverse;
      default:
        return this.driver.Motors.off;
    }
  }
}

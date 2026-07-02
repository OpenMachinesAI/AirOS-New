export class MBotSimulator {
    device: any = null;
    server: any = null;
    
    async request() {
        console.log("[Simulator] Requesting Bluetooth Device...");
    }

    async connect() {
        console.log("[Simulator] Connected to simulated robot.");
    }

    async ensureConnected() {
        return true;
    }

    async init() {
        console.log("[Simulator] Initialised.");
    }

    async leftForward(speed: number) {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.leftForward = speed;
    }

    async leftReverse(speed: number) {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.leftForward = -speed;
    }

    async rightForward(speed: number) {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.rightForward = speed;
    }

    async rightReverse(speed: number) {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.rightForward = -speed;
    }

    async stopLeftMotor() {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.leftForward = 0;
    }

    async stopRightMotor() {
        if ((window as any).simulatorRobot) (window as any).simulatorRobot.rightForward = 0;
    }

    async stopMotors() {
        if ((window as any).simulatorRobot) {
            (window as any).simulatorRobot.leftForward = 0;
            (window as any).simulatorRobot.rightForward = 0;
        }
    }

    async setMotorSpeeds(leftSpeed: number, rightSpeed: number) {
        if ((window as any).simulatorRobot) {
            (window as any).simulatorRobot.leftForward = leftSpeed;
            (window as any).simulatorRobot.rightForward = rightSpeed;
        }
    }

    async spinLeftFor(dir: string, degrees: number, speed: number) {
        if ((window as any).simulatorRobot) {
            await (window as any).simulatorRobot.spinLeftFor(dir, degrees, speed);
        } else {
            await new Promise(r => setTimeout(r, degrees * 5));
        }
    }

    async spinRightFor(dir: string, degrees: number, speed: number) {
        if ((window as any).simulatorRobot) {
            await (window as any).simulatorRobot.spinRightFor(dir, degrees, speed);
        } else {
            await new Promise(r => setTimeout(r, degrees * 5));
        }
    }

    async startupCalibration(leftMs: number, rightMs: number, speed: number) {
        console.log("[Simulator] Startup calibration.");
    }
}

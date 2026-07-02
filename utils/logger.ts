export class Logger {
    logs: string[] = [];
    listeners: Function[] = [];

    pushLog(message: string) {
        this.logs.unshift(message);
        if (this.logs.length > 100) this.logs.pop(); // keep last 100 logs
        this.listeners.forEach(l => l());
    }

    subscribe(listener: Function) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    clear() {
        this.logs = [];
        this.listeners.forEach(l => l());
    }
}

export const appLogger = new Logger();

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
    appLogger.pushLog("[LOG] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalLog(...args);
};

console.error = (...args) => {
    appLogger.pushLog("[ERR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalError(...args);
};

console.warn = (...args) => {
    appLogger.pushLog("[WARN] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    originalWarn(...args);
};

// https://blog.makerx.com.au/a-type-safe-event-emitter-in-node-js/
type Listener<T extends unknown[] = any> = (...args: T) => void;

export class EventEmitter<T extends Record<string, unknown[]>> {
    private listeners: { [key in keyof T]?: Listener<any>[] } = {}

    removeAllListeners() {
        this.listeners = {};
    }

    emit<K extends keyof T>(eventName: K, ...args: T[K]) {
        const listeners = this.listeners[eventName];
        if (!listeners) {
            return;
        }
        for (let i = 0; i < listeners.length; i++) {
            listeners[i](...args);
        }
    }

    // a svelte-y event handler because we so often mount and subscribe and want to auto unsubscribe
    auto<K extends keyof T>(eventName: K, listener: Listener<T[K]>) {
        return () => {
            this.on(eventName, listener);
            return () => this.off(eventName, listener);
        }
    }

    // TODO: maybe good to keep a count of subscribers so we don't accidentally create long subscription lists
    on<K extends keyof T>(eventName: K, listener: Listener<T[K]>) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(listener);
    }

    off<K extends keyof T>(eventName: K, listener: Listener<T[K]>) {
        this.listeners[eventName] = this.listeners[eventName].filter(l => l !== listener);
    }
}

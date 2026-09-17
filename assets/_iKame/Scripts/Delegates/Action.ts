export class Action<T = any> {
    protected _listeners: ((...args: T[]) => void)[] = []

    on(listener: (...args: T[]) => void): () => void {
        this._listeners.push(listener)
        return () => this.off(listener)
    }

    off(listener: (...args: T[]) => void): void {
        const index = this._listeners.indexOf(listener)
        if (index !== -1) {
            this._listeners.splice(index, 1)
        }
    }

    emit(...args: T[]): void {
        for (let i = 0; i < this._listeners.length; i++) {
            this._listeners[i](...args)
        }
    }

    clear(): void {
        this._listeners = []
    }

    get length(): number {
        return this._listeners.length
    }

    has(listener: (...args: T[]) => void): boolean {
        return this._listeners.indexOf(listener) !== -1
    }
}


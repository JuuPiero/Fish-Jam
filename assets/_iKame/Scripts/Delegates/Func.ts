import { Action } from "./Action"

export class Func<T extends any[] = any[], R = any> extends Action<T> {
    private _fn?: (...args: T) => R

    set(fn: (...args: T) => R): void {
        this._fn = fn
    }

    call(...args: T): R | undefined {
        if (this._fn) {
            const result = this._fn(...args)
            this.emit(...args)
            return result
        }
        return undefined
    }
}

// // Sử dụng
// const calculator = new Func<[number, number], number>()
// calculator.set((a, b) => a + b)

// calculator.on((a, b) => {
//     console.log(`Calculated: ${a} + ${b}`)
// })

// const result = calculator.call(10, 20) // Log: "Calculated: 10 + 20"
// console.log(result) // 30
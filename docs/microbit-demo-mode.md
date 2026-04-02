# Micro:bit Demo Mode

Use this MakeCode TypeScript for the Micro:bit demo unit.

Button `A` starts demo mode.
Button `B` stops demo mode.

```typescript
let demoRunning = false

function startDemo() {
    if (demoRunning) return
    demoRunning = true
    basic.showString("DEMO")
    serial.writeLine("A")
}

function stopDemo() {
    if (!demoRunning) return
    demoRunning = false
    serial.writeLine("B")
    basic.showIcon(IconNames.No)
}

input.onButtonPressed(Button.A, function () {
    startDemo()
})

input.onButtonPressed(Button.B, function () {
    stopDemo()
})

basic.forever(function () {
    if (demoRunning) {
        basic.showLeds(`
            . . # . .
            . # # # .
            # . # . #
            . # # # .
            . . # . .
        `)
        pause(300)
        basic.clearScreen()
        pause(200)
    } else {
        basic.showIcon(IconNames.SmallDiamond)
        pause(250)
    }
})
```

If you want the phone app to react to the `A` / `B` messages, wire the same strings into the USB-OTG serial listener on the app side.

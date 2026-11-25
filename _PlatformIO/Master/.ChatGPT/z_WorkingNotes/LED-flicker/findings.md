# Head LED flicker after the USB handshake

**Yes. The Teensy writes to the MCP23017 LED expander on every pass through `loop()`, even if the host sends nothing and the head has only one state.** In the current source, that state is `ALL_ON`. The off-time limiter can then send a second I2C command that turns all 16 outputs off. The next pass turns them back on. This can explain flicker in a connected, otherwise idle system. [Main loop](../../../src/Main.cpp#L32) and [off-time limiter](../../../components/Timing/CMasterTimer.cpp#L96)

## Which firmware is on the board?

The working copy of `src/Main.cpp` selects `ALL_ON`. The existing local PlatformIO image, version **`0.1.6+12`**, was built with a single **`ALL_OFF`** state, as verified in the compiled `setup()`. Starting from that image's default, the ordinary loop repeatedly sends zero. A sustained all-off sequence gives the limiter no reason to turn an LED on. Check the board's handshake `DEVICE_VERSION` and the state in its data blocks before attributing the observed flicker to the limiter. The running board was not measured for this review. [Current startup state](../../../src/Main.cpp#L14), [cached ELF](../../../.pio/build/teensy41/firmware.elf) and [handshake version field](../../../components/USB/CSerial_Handshake.cpp#L151)

## What the normal loop sends

| When | Write to the expander | Why it matters |
| --- | --- | --- |
| Start of every pass | `Head.setNextState()` reapplies the selected state. `ALL_ON` maps to `FF FF`. | An identical write is expected bus traffic. A stream of `FF FF` alone contains no instruction to blink. |
| End of a normal pass, when calculated off-time is positive | `Timer.honourOffTime()` calls `LED.allOff()`, sending `00 00`, then waits. | This creates a real off interval. The next `setNextState()` restores the selected state. |
| Eligible noise-sample pass, on a three-second timer | The state write has already happened. The early return skips that pass's off-time check. | With `ALL_ON` selected, this can occasionally extend an on interval. |

The limiter weights elapsed time by the previous number of enabled outputs minus one. With 16 enabled, the weight grows by 15 per tick. It uses roughly one second of history, so the configured 4 ms state period alone does not predict the blink rate. A successful handshake resets that history. It does not select a new sequence. The data block retains the logical head state through a limiter-induced off interval, so the host can display `ALL_ON` while the physical outputs pulse. [State application](../../../components/Head/CHead.cpp#L25), [output mapping](../../../components/_Helpers/PinHelpers.h#L24), [I2C write](../../../components/_Helpers/LEDpins.cpp#L22), [timing calculation](../../../components/Timing/CMasterTimer.cpp#L44), [noise-sample branch](../../../src/Hardware.cpp#L57) and [block state](../../../components/A2D/CA2D.cpp#L165)

## Other ways the LEDs can change

- **Host commands.** `XCMD_SetState` changes the first sequence entry. `XCMD_SetSequence` replaces the sequence and restarts it. The loop applies those changes when it next reaches the affected entry. Caldera's normal post-connect refresh can send `XCMD_SetActiveState`, which only selects the hardware context for subsequent commands. [Firmware dispatch](../../../components/USB/XCommands.cpp#L35) and [Caldera refresh](../../../../../Asano/Caldera/Caldera.cs#L131)
- **USB disconnect in debug mode.** Losing the serial connection triggers one all-on write, a 300 ms wait, an all-off write, then about 1.3 seconds before the loop resumes. A repeated connection drop can therefore flash even the all-off build. On a firmware error, the outputs fill and clear bit by bit while serial repeats `Error: system halted.` [Disconnect handler](../../../components/USB/CSerialWrapper.cpp#L22), [flash pattern](../../../components/_Helpers/LEDpins.cpp#L44) and [error pattern](../../../components/_Helpers/LEDpins.cpp#L105)
- **Startup and other pins.** If the handshake finishes during setup, expander initialization and the startup clears can still follow it once. During normal acquisition, the activity LED toggles directly on Teensy pin 4. The digipots use SPI. The ADC and timer callbacks contain no head LED I2C writes. [Setup order](../../../src/Hardware.cpp#L13), [activity pin](../../../components/_Helpers/Helpers.cpp#L33), [digipot transfer](../../../components/_Helpers/CDigiPot.cpp#L73) and [ADC callback](../../../components/A2D/CA2D_DMA.cpp#L65)

## How to tell on the bench

Capture **SDA on Teensy pin 18** and **SCL on pin 19**. Decode writes to **7-bit address `0x20`**, starting at GPIO register **`0x12`**. The firmware requests a 400 kHz bus. If possible, capture the affected MCP output alongside the bus. [Expander initialization](../../../components/_Helpers/LEDpins.cpp#L65) and [installed driver's two-port write](../../../.pio/libdeps/teensy41/Adafruit%20MCP23017%20Arduino%20Library/src/Adafruit_MCP23X17.cpp#L64)

- If acknowledged `12 00 00` and `12 FF FF` writes line up with the dark and bright edges, the Teensy is commanding the transitions.
- If the selected output bit stays constant in the decoded writes, compare the MCP output with the light. A steady MCP output while the LED flickers points downstream to the LED driver, supply or wiring. An MCP output that changes despite a constant command points back toward the expander, its reset or its supply.
- For a comparison using the existing controls, select only `RED1`. After earlier multi-LED history has aged out (about one second), the limiter should add no further off intervals. The loop will continue writing `12 00 01`. This tests the same I2C path with the limiter still enabled. [RED1 bit definition](../../../components/Head/CHead.h#L34) and [limiter calculation](../../../components/Timing/CMasterTimer.cpp#L126)

// Run before every test file: a test that set the package's clock by `_cheat_clock` hands the next
// one the device's clock again.
import { afterEach } from 'vitest'
import { _cheat_clockReset } from '../src/helpers/clock'

afterEach(() => { _cheat_clockReset() })

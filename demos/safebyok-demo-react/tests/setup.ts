// Each test's render is unmounted after it, and with it each provider's bank swept. Testing
// Library unmounts by itself only where vitest's globals are on, which these tests leave off.
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// A findBy or waitFor returns the moment its condition has, so its ceiling costs nothing when
// the test passes. What it waits on includes making a vault (its keys, the rows it puts and stows), which on a
// loaded CI machine outlasts the default second; the test's own ceiling (vite.config.ts) is higher.
configure({ asyncUtilTimeout: 5000 })

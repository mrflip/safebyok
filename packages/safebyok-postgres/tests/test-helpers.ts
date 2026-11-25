/** Test helpers: the boot timeout, beside the core's own helpers. */

// Re-export the core's test helpers, so a test here imports this one module as TH.
export * from 'safebyok/testing'

// On a CI runner, PGlite's WebAssembly can take eight seconds or more to compile from cold, longer than a test's default timeout.
export const BootMillis = 60_000

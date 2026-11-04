/* eslint-disable no-console -- the one module in src/ that writes to the console: the fallback a vault logs to when its host passes no logger, as the Coach approved */
import type { VaultLogger } from './logger'

/** The console, each message tagged `safebyok:` and followed by its story and its error when there are any. */
export const consoleLogger: VaultLogger = {
  log:   (message, story, err) => { console.log(...consoleArgs(message, story, err)) },
  warn:  (message, story, err) => { console.warn(...consoleArgs(message, story, err)) },
  error: (message, story, err) => { console.error(...consoleArgs(message, story, err)) },
}

/** What the console is handed: the tagged message, then the story and the error, each only when present. */
const consoleArgs = (message?: string, story?: Record<string, unknown>, err?: Error | null): unknown[] => [
  message === undefined ? 'safebyok' : `safebyok: ${message}`,
  ...(story === undefined ? [] : [story]),
  ...(err === undefined || err === null ? [] : [err]),
]

/**
 * The helpers of safebyok-react's tests that build JSX, kept apart from `test-helpers.ts` because
 * a `.ts` file cannot hold JSX. `test-helpers.ts` re-exports them: reach them as `TH`
 * (`import * as TH from './test-helpers'`), never by this file's name.
 */
import { Activity, type ReactNode } from 'react'

/**
 * `shown` inside an Activity in `mode`, for `rerender` to hide and show again.
 *
 * @example
 *   const { rerender } = render(TH.inActivity('visible', dialog))
 *   rerender(TH.inActivity('hidden', dialog))
 */
export const inActivity = (mode: 'visible' | 'hidden', shown: ReactNode) => <Activity mode={mode}>{shown}</Activity>

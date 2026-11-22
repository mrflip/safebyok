import { liveOf } from 'safebyok-react-lean'
import { KeyLabelpath, Knock } from '../lib/sok'

/** Whether the user's Anthropic API key is stored: undefined while the page is still looking. Re-renders only when the answer changes. */
export function useIsKeyStored(): boolean | undefined {
  return Knock.useBox(KeyLabelpath, { select: (thing) => liveOf(thing) !== null }).data
}

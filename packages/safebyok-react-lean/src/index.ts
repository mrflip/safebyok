export * from './giver/react-giver'
export type { GiverBanks, GiverConfig } from './giver/shapes-giver'
export { liveGateOf, liveOf, passkeyHeaderOf } from './giver/giver-defaults'
export type { BoxQueryOpts } from './giver/shapes-giver'
export { popField } from './giver/pop-field'
export type { Draft, DraftPutOpts, WhisperFieldProps } from './giver/use-draft'
// A box's sidecar keeps a whisper's mask: the core's, one binding across both packages.
export { type MaskOpts, mask } from 'safebyok'
// The bank snapshot a hook shows while nobody is signed in: the core's, so a host compares one binding.
export { SignedOutBank } from 'safebyok'

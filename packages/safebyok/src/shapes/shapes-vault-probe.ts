/** What `Vault.probe` is asked and what it reports: the box it puts, the steps it times, and whether the whisper came back as put. */

import { CX, Validator } from 'safebyok-big/internals'
import type * as Z from 'zod'
import type { BoxLabelpath } from './primitives'
import { VaultChecks } from './shapes-vault'

// == [Asked]: ProbeLabelpath, ProbeChecks, ProbeAsked

// A label a host would choose only by naming its box for safebyok's probe: nothing reserves it.
/** Where `Vault.probe` puts its box unless it is asked for another labelpath. */
export const ProbeLabelpath = 'box/safebyok_probe' satisfies BoxLabelpath

/** The checks of what `Vault.probe` is asked: the labelpath of its box, never the root box's, and the whisper and sidecar it puts, each with a default. */
export const ProbeChecks = Validator.Checkers('bad_record', ({ obj }) => ({
  probeAsked: obj({
    labelpath: VaultChecks.boxLabelpath.default(ProbeLabelpath),
    whisper:   CX.whisper.default({ note: 'Shhh, this is a whisper' }),
    sidecar:   CX.sidecar.default({ example: true }),
  }).strict(),
}))

/** What `Vault.probe` is asked: where its box goes and what it holds, each with a default. */
export type ProbeAsked = Z.input<typeof ProbeChecks.probeAsked>
// --

// == [Reported]: probeStepkindVals, ProbeStepkind, ProbeStep, ProbeReport

/** The steps of `Vault.probe`, in the order it takes them: put the box, get it back from storage, unseal it, and delete it. */
export const probeStepkindVals = ['put', 'get', 'unseal', 'del'] as const
/** One step of `Vault.probe`, one of {@link probeStepkindVals}. A refusal of the probe names the step that refused as its `meta.stepkind`. */
export type ProbeStepkind = typeof probeStepkindVals[number]

/** How one step of `Vault.probe` went: how long it took, in milliseconds. */
export type ProbeStep = Readonly<{ millis: number }>

/** How `Vault.probe` went: the labelpath of its box, each step, and whether the whisper unsealed was the one put. It carries no whisper. */
export type ProbeReport = Readonly<{
  labelpath:      BoxLabelpath
  whisperMatched: boolean
  steps:          Readonly<Record<ProbeStepkind, ProbeStep>>
}>
// --

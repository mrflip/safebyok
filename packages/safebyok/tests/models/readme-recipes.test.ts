/** The README's three recipes for showing a whisper, each run in its order on real seals: a script, a raw field, and React with the hook played by hand. */

import { describe, expect, it, vi } from 'vitest'
import { BoxFields } from '../../src/dom/box-fields'
import { LOCKED, VEILED } from '../../src/helpers/consts'
import type { Box } from '../../src/models/box'
import type { Vault } from '../../src/models/vault'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'

useBankWorlds()

const Stored = { apiKey: 'sk-test-0000' }

/** The sequence `useSyncExternalStore(subscribe, read)` runs: what a component would paint, told of each change. */
const hookOf = <ValT>(subscribe: (listener: () => void) => () => void, read: () => ValT) => {
  const painted = [read()]
  const unsubscribe = subscribe(() => { if (read() !== painted.at(-1)) { painted.push(read()) } })
  return { painted, unsubscribe, current: () => painted.at(-1) as ValT }
}

/** A box storing {@link Stored}, on a bank that asks as a dialog would, in a vault unlocked. */
const makeRecipeBox = async (): Promise<{ vault: Vault, box: Box }> => {
  const bank = makeBankWorld().bankOn()
  await bank.hello()
  const vault = await bank.ensureVault({ vaultlabel: 'main' })
  const box = await vault.putBox({ boxlabel: 'stripe', whisper: Stored })
  return { vault, box }
}

describe("the README's script", () => {
  it("fetches its passphrase in requestCleartext, spreads and edits the whisper, and a lock takes its fields and an unlock brings them back", async () => {
    const doppler = { get: vi.fn(() => Promise.resolve('a passphrase from the container')) }
    const bank = makeBankWorld().bankOn({
      requestCleartext: async (gating) => {
        if (gating.gatingkind !== 'build_vault' && gating.gatingkind !== 'unlock_vault') { return }
        await gating.attempt({ passphraseClear: await doppler.get() })
      },
    })
    await bank.hello()
    const vault = await bank.ensureVault({ vaultlabel: 'main' })
    await vault.hello()
    await vault.putBox({ boxlabel: 'stripe', whisper: Stored })
    const box = (await vault.getBox('stripe'))!
    expect(doppler.get).toHaveBeenCalledOnce()

    await box.expose()
    const charge = vi.fn()
    charge({ ...box.whisper, amount: 100 })
    expect(charge).toHaveBeenCalledWith({ apiKey: Stored.apiKey, amount: 100 })
    box.whisper['org'] = 'acme'
    await box.putExposed()
    expect(await box.extractWhisper()).to.deep.equal({ ...Stored, org: 'acme' })

    const kept = box.whisper
    vault.lock()
    expect(box.whisper['apiKey']).to.eq(undefined)
    expect(kept['apiKey']).to.eq(Stored.apiKey) // the README's warning
    await vault.ensureUnlocked()
    expect(doppler.get).toHaveBeenCalledTimes(2)
    expect(box.whisper).to.deep.equal({ ...Stored, org: 'acme' })
  })
})

describe("the README's raw field", () => {
  it("shows at an expose, hides at a lock with an edit kept, saves on the button, and unexposes as it unmounts", async () => {
    const { vault, box } = await makeRecipeBox()
    const hook = hookOf(box.subscribe, box.getSnapshot)
    const input = { value: '' }
    const unmount = BoxFields.of(box).bind('apiKey')(input)
    expect(hook.current().exposed).to.be.false
    expect(input.value).to.eq('')

    await box.expose()
    expect(hook.current().exposed).to.be.true
    expect(input.value).to.eq(Stored.apiKey)

    input.value = 'sk-test-edited'
    vault.lock()
    expect(input.value).to.eq('')
    expect(hook.current().lockState).to.eq('locked')
    await vault.ensureUnlocked()
    expect(input.value).to.eq('sk-test-edited')
    expect(await box.extractWhisper()).to.deep.equal(Stored)

    await BoxFields.of(box).save()
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-edited' })

    unmount?.()
    expect(input.value).to.eq('')
    expect(hook.current().exposed).to.be.false
    expect(box.whisper['apiKey']).to.eq(undefined)
  })
})

describe("the README's React form", () => {
  it("paints a new object at each patch, a read-only blank at a lock and a veil, and stores what was patched", async () => {
    const { vault, box } = await makeRecipeBox()
    await box.expose()
    const hook = hookOf(box.subscribe, () => box.whisper)
    expect(hook.current()).to.deep.equal(Stored)
    expect(box.isShowing).to.be.true

    box.patchWhisper({ apiKey: 'sk-test-typed' })
    expect(hook.current()).to.deep.equal({ apiKey: 'sk-test-typed' })
    expect(hook.painted).to.have.length(2)

    vault.lock()
    expect(hook.current()).to.eq(LOCKED)
    expect(hook.current()['apiKey']).to.eq(undefined)
    expect(box.isShowing).to.be.false
    await vault.ensureUnlocked()
    expect(hook.current()).to.deep.equal({ apiKey: 'sk-test-typed' })
    expect(box.isShowing).to.be.true

    await box.putExposed()
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-typed' })
    box.veil()
    expect(hook.current()).to.eq(VEILED)
    expect(box.isShowing).to.be.false
    hook.unsubscribe()
  })
})

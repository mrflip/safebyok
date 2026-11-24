import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useActionState, useEffect } from 'react'
import { type BoxRecord, VaultMinder, isVaultError } from 'safebyok'
import * as LeanTH from 'safebyok/testing'
import { describe, expect, it } from 'vitest'
import type { Draft, DraftPutOpts } from '../../src/giver/use-draft'
import * as TH from '../test-helpers'

/** A key for the joke service a user types, an obvious fake. */
const TypedKey = 'sk-test-typed-4242'

/** The key the minder caches the jokes box under, for the world's user. */
const JokesItemKey = VaultMinder.itemQueryKeyOf({ ...LeanTH.WorldScope, labelpath: `box/${TH.JokesPath}` })

/** What the draft editor last answered and its last put settled to, for a test to read. */
interface DraftSeen {
  draft:   Draft | null
  puts:    number
  putErr:  unknown
}

/** The editor a host would write over a draft of the jokes box: the key's field, the sidecar's tier, Save and Undo. `putOpts` go to each put.
 * With `isInForm`, the editor is a form whose action is Save.
 */
function makeDraftEditor(world: TH.ProviderWorld, putOpts?: DraftPutOpts, isInForm = false) {
  const seen: DraftSeen = { draft: null, puts: 0, putErr: null }
  function DraftEditor() {
    const draft = world.Bank.useDraft(TH.JokesPath)
    useEffect(() => { seen.draft = draft })
    async function save() {
      try {
        await draft.put(putOpts)
        seen.puts += 1
      } catch (err) {
        seen.putErr = err
      }
    }
    // An action state, so the editor renders again in the commit where React resets the form, as a host's would.
    const [, saveAction] = useActionState(async (prior: number) => { await save(); return prior + 1 }, 0)
    const { tier } = draft.sidecar
    const fields = (
      <>
        <input aria-label="Key" {...draft.whisperField('apiKey')} />
        <p>{draft.isDirty ? 'Dirty' : 'Clean'}{draft.isBehind ? ' and behind' : ''}</p>
        <p>{`Tier ${(typeof tier === 'string') ? tier : 'none'}`}</p>
        <button type="button" onClick={() => { draft.setSidecar({ ...draft.sidecar, tier: 'pro' }) }}>Go pro</button>
        {isInForm ? <button type="submit">Save</button> : <button type="button" onClick={() => { void save() }}>Save</button>}
        <button type="button" onClick={draft.discard}>Undo</button>
      </>
    )
    return isInForm ? <form action={saveAction}>{fields}</form> : <div>{fields}</div>
  }
  return { DraftEditor, seen }
}

/** Render the draft editor over a world with the joke service's key stored, its bank unlocked unless `isLocked`, as a form if `isInForm`. */
async function renderDraftEditor({ putOpts, isLocked = false, isInForm = false }: Readonly<{ putOpts?: DraftPutOpts, isLocked?: boolean, isInForm?: boolean }> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const editor = makeDraftEditor(world, putOpts, isInForm)
  const rendered = render(TH.providerTreeOf(world, <editor.DraftEditor />, { userid: TH.ProviderUser }))
  const device = await waitFor(() => world._cheat_device())
  await act(async () => {
    await device.signin(TH.ProviderUser)
    if (! isLocked) { await device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }) }
  })
  await screen.findByText('Tier none')
  const input = screen.getByLabelText<HTMLInputElement>('Key')
  return { world, device, input, ...editor, ...rendered }
}

/** Focus `input` and wait for the stored key to show in it. */
async function revealIn(input: HTMLInputElement): Promise<void> {
  act(() => { input.focus() })
  await waitFor(() => { expect([input.type, input.value]).to.deep.equal(['text', TH.JokesKey]) })
}

/** Type the user's key into `input`, replacing what it shows. */
function typeKeyInto(input: HTMLInputElement): void {
  fireEvent.change(input, { target: { value: TypedKey } })
}

/** The key stored at the jokes box, as the world's bank unseals it. */
async function storedKeyOf(world: TH.ProviderWorld): Promise<string> {
  return await world.Bank.withWhisper(TH.JokesPath, (whisper) => String(whisper['apiKey']))
}

describe("useDraft", () => {
  // useDraft @example
  it("reveals the stored key on focus, and puts what was typed, with neither key held by React or the QueryClient", async () => {
    const { world, input, seen, container } = await renderDraftEditor()
    expect([input.type, input.value, input.placeholder]).to.deep.equal(['password', '', '••••••••'])
    expect(input.hasAttribute('name')).to.eq(false)
    await revealIn(input)
    TH.expectTextUnheld(TH.JokesKey, container, world.clients())
    typeKeyInto(input)
    await screen.findByText('Dirty')
    TH.expectTextUnheld(TH.JokesKey, container, world.clients())
    TH.expectTextUnheld(TypedKey, container, world.clients())
    act(() => { input.blur() })
    expect([input.type, input.value]).to.deep.equal(['password', TypedKey])
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.puts).to.eq(1) })
    await screen.findByText('Clean')
    expect([input.type, input.value]).to.deep.equal(['password', ''])
    expect(await storedKeyOf(world)).to.eq(TypedKey)
    expect(world.Bank.queryClient().getQueryData<BoxRecord>(JokesItemKey)?.sidecar).to.deep.equal({ service: 'jokes' })
    TH.expectTextUnheld(TH.JokesKey, container, world.clients())
    TH.expectTextUnheld(TypedKey, container, world.clients())
  })

  it("discards what was typed, emptying the field and leaving the stored key, with neither key held", async () => {
    const { world, input, container } = await renderDraftEditor()
    await revealIn(input)
    typeKeyInto(input)
    await screen.findByText('Dirty')
    TH.expectTextUnheld(TypedKey, container, world.clients())
    act(() => { screen.getByText('Undo').click() })
    await screen.findByText('Clean')
    expect(input.value).to.eq('')
    expect(await storedKeyOf(world)).to.eq(TH.JokesKey)
    TH.expectTextUnheld(TH.JokesKey, container, world.clients())
    TH.expectTextUnheld(TypedKey, container, world.clients())
  })

  it("masks the field on blur, emptying it unless it was typed into, and shows what was typed on the next focus", async () => {
    const { input } = await renderDraftEditor()
    await revealIn(input)
    act(() => { input.blur() })
    expect([input.type, input.value]).to.deep.equal(['password', ''])
    await revealIn(input)
    typeKeyInto(input)
    act(() => { input.blur() })
    expect([input.type, input.value]).to.deep.equal(['password', TypedKey])
    act(() => { input.focus() })
    await waitFor(() => { expect([input.type, input.value]).to.deep.equal(['text', TypedKey]) })
  })

  it("masks and empties the field shown when the bank locks", async () => {
    const { world, input } = await renderDraftEditor()
    await revealIn(input)
    act(() => { world.Bank.lock() })
    expect([input.type, input.value]).to.deep.equal(['password', ''])
  })

  it("waits on a locked bank for the unlock form, read-only, and reveals the key once unlocked", async () => {
    const { device, input, seen } = await renderDraftEditor({ isLocked: true })
    act(() => { input.focus() })
    await waitFor(() => { expect(device.bank!.getSnapshot().isUnlockWanted).to.eq(true) })
    expect(input.readOnly).to.eq(true)
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }))
    await waitFor(() => { expect([input.type, input.value, input.readOnly]).to.deep.equal(['text', TH.JokesKey, false]) })
    expect(seen.draft?.lastErr).to.be.null
  })

  it("leaves the field masked when the unlock form is dismissed, with the refusal as lastErr", async () => {
    const { world, device, input, seen } = await renderDraftEditor({ isLocked: true })
    act(() => { input.focus() })
    await waitFor(() => { expect(device.bank!.getSnapshot().isUnlockWanted).to.eq(true) })
    act(() => { world.Bank.dismissUnlock() })
    await waitFor(() => { expect(isVaultError(seen.draft?.lastErr) && seen.draft.lastErr.refusalkind).to.eq('dismissed') })
    expect([input.type, input.value, input.readOnly]).to.deep.equal(['password', '', false])
  })

  it("puts the sidecar set, keeping the stored key", async () => {
    const { world, seen } = await renderDraftEditor()
    act(() => { screen.getByText('Go pro').click() })
    await screen.findByText('Dirty')
    expect(seen.draft?.isWhisperDirty).to.eq(false)
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.puts).to.eq(1) })
    await screen.findByText('Clean')
    expect(world.Bank.queryClient().getQueryData<BoxRecord>(JokesItemKey)?.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' })
    expect(await storedKeyOf(world)).to.eq(TH.JokesKey)
  })

  it("is clean again once the sidecar set is the base's", async () => {
    const { seen } = await renderDraftEditor()
    act(() => { seen.draft!.setSidecar({ service: 'jokes', tier: 'pro' }) })
    await screen.findByText('Dirty')
    act(() => { seen.draft!.setSidecar({ service: 'jokes' }) })
    await screen.findByText('Clean')
    expect(seen.draft?.sidecar).to.deep.equal({ service: 'jokes' })
  })

  it("stamps the sidecar through sidecarOf, from the whisper written, when a field was typed into", async () => {
    const stamps: boolean[] = []
    const { world, input, seen } = await renderDraftEditor({ putOpts: { sidecarOf: (whisper, sidecar) => {
      stamps.push(seen.draft!.isWhisperDirty)
      return { ...sidecar, mask: `…${String(whisper['apiKey']).slice(-4)}`, rotated_at: 1_760_000_000_000 }
    } } })
    await revealIn(input)
    typeKeyInto(input)
    await waitFor(() => { expect(seen.draft?.isWhisperDirty).to.eq(true) })
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.puts).to.eq(1) })
    expect(stamps).to.deep.equal([true])
    expect(world.Bank.queryClient().getQueryData<BoxRecord>(JokesItemKey)?.sidecar).to.deep.equal({ service: 'jokes', mask: '…4242', rotated_at: 1_760_000_000_000 })
  })

  it("rejects its put with an Error when sidecarOf throws a value that is no Error, the value its cause", async () => {
    const thrown: unknown = { code: 42 }
    const { input, seen } = await renderDraftEditor({ putOpts: { sidecarOf: () => { throw thrown as Error } } })
    await revealIn(input)
    typeKeyInto(input)
    await waitFor(() => { expect(seen.draft?.isWhisperDirty).to.eq(true) })
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.putErr).to.be.instanceOf(Error) })
    expect((seen.putErr as Error).cause).to.eq(thrown)
    expect(seen.draft?.isWhisperDirty).to.eq(true)
  })

  it("follows the stored box while untouched, and once edited is behind another device's write, its put refusing stale_write until discarded", async () => {
    const { world, seen } = await renderDraftEditor()
    const otherVault = world._cheat_otherVault!
    await act(() => otherVault.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes', tier: 'max' } }, { whisper: LeanTH.Whisper }))
    await screen.findByText('Tier max')
    expect([seen.draft?.isBehind, seen.draft?.base?.revseq]).to.deep.equal([false, 1])
    act(() => { screen.getByText('Go pro').click() })
    await act(() => otherVault.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes', tier: 'ultra' } }, { whisper: LeanTH.Whisper }))
    await screen.findByText('Dirty and behind')
    expect([seen.draft?.base?.revseq, seen.draft?.sidecar]).to.deep.equal([1, { service: 'jokes', tier: 'pro' }])
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('stale_write') })
    expect(screen.getByText('Dirty and behind')).to.not.be.null
    act(() => { screen.getByText('Undo').click() })
    await screen.findByText('Clean')
    expect([seen.draft?.base?.revseq, seen.draft?.sidecar]).to.deep.equal([2, { service: 'jokes', tier: 'ultra' }])
  })

  it("over a deleted box, once edited is behind the box another device puts again, its put refusing stale_write", async () => {
    const { world, seen } = await renderDraftEditor()
    await waitFor(() => { expect(seen.draft?.base).to.not.be.undefined })
    await act(() => world._cheat_otherVault!.delBoxOnce(`box/${TH.JokesPath}`))
    await waitFor(() => { expect(seen.draft?.base).to.be.null })
    act(() => { screen.getByText('Go pro').click() })
    await act(() => world._cheat_otherVault!.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes' } }, { whisper: LeanTH.Whisper }))
    await screen.findByText('Dirty and behind')
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('stale_write') })
  })

  it("forgets what was typed when its form's action refuses the put, clean again, so the next put writes nothing typed", async () => {
    const { world, device, input, seen } = await renderDraftEditor({ isLocked: true, isInForm: true })
    typeKeyInto(input)
    await screen.findByText('Dirty')
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(device.bank!.getSnapshot().isUnlockWanted).to.eq(true) })
    act(() => { world.Bank.dismissUnlock() })
    await waitFor(() => { expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('dismissed') })
    await screen.findByText('Clean')
    expect([input.value, seen.draft?.isWhisperDirty]).to.deep.equal(['', false])
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }))
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.puts).to.eq(1) })
    expect(await storedKeyOf(world)).to.eq(TH.JokesKey)
  })

  it("forgets only what was typed when its form's action refuses the put, so the next put writes the sidecar set over the stored key", async () => {
    const { world, device, input, seen } = await renderDraftEditor({ isLocked: true, isInForm: true })
    act(() => { screen.getByText('Go pro').click() })
    await screen.findByText('Tier pro')
    const baseRevseq = seen.draft?.base?.revseq
    typeKeyInto(input)
    await waitFor(() => { expect(seen.draft?.isWhisperDirty).to.eq(true) })
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(device.bank!.getSnapshot().isUnlockWanted).to.eq(true) })
    act(() => { world.Bank.dismissUnlock() })
    await waitFor(() => { expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('dismissed') })
    await waitFor(() => { expect(seen.draft?.isWhisperDirty).to.eq(false) })
    expect([input.value, input.type]).to.deep.equal(['', 'password'])
    expect([seen.draft?.isDirty, seen.draft?.isBehind, seen.draft?.base?.revseq, seen.draft?.sidecar]).to.deep.equal([true, false, baseRevseq, { service: 'jokes', tier: 'pro' }])
    expect(screen.getByText('Dirty')).to.exist
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }))
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(seen.puts).to.eq(1) })
    await screen.findByText('Clean')
    expect(world.Bank.queryClient().getQueryData<BoxRecord>(JokesItemKey)?.sidecar).to.deep.equal({ service: 'jokes', tier: 'pro' })
    expect(await storedKeyOf(world)).to.eq(TH.JokesKey)
  })

  it("keeps its base through its form's reset while a sidecar edit is pending, behind another device's write since", async () => {
    const { world, device, input, seen } = await renderDraftEditor({ isLocked: true, isInForm: true })
    act(() => { screen.getByText('Go pro').click() })
    await screen.findByText('Tier pro')
    const baseRevseq = seen.draft?.base?.revseq
    typeKeyInto(input)
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(device.bank!.getSnapshot().isUnlockWanted).to.eq(true) })
    act(() => { world.Bank.dismissUnlock() })
    await waitFor(() => { expect(seen.draft?.isWhisperDirty).to.eq(false) })
    await act(() => world._cheat_otherVault!.putBoxOnce(`box/${TH.JokesPath}`, { sidecar: { service: 'jokes', tier: 'max' } }, { whisper: LeanTH.Whisper }))
    await screen.findByText('Dirty and behind')
    expect([seen.draft?.base?.revseq, seen.draft?.sidecar]).to.deep.equal([baseRevseq, { service: 'jokes', tier: 'pro' }])
    await act(() => device.bank!.gate.unlock({ passphraseCleartext: LeanTH.TestPassphrase }))
    act(() => { screen.getByText('Save').click() })
    await waitFor(() => { expect(isVaultError(seen.putErr) && seen.putErr.refusalkind).to.eq('stale_write') })
  })

  it("keeps what was typed outside any form when a form elsewhere on the page is reset", async () => {
    const { input } = await renderDraftEditor()
    render(<form aria-label="Other"><input aria-label="Other field" defaultValue="other" /></form>)
    typeKeyInto(input)
    await screen.findByText('Dirty')
    act(() => { screen.getByRole<HTMLFormElement>('form', { name: 'Other' }).reset() })
    expect(screen.getByText('Dirty')).to.exist
    expect(input.value).to.eq(TypedKey)
  })

  it("refuses to put a field typed into whose input has left the page, rather than write it empty", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result } = renderHook(() => world.Bank.useDraft(TH.JokesPath), { wrapper: Wrapper })
    const leave = result.current.whisperField('apiKey').ref(document.createElement('input')) as () => void
    act(() => { result.current.whisperField('apiKey').onChange({} as never) })
    expect(result.current.isWhisperDirty).to.eq(true)
    leave()
    await TH.expectRefusal(result.current.put(), 'bad_record')
  })

  it("refuses a fieldname that is not a string, and a sidecarOf that is not a function", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    function Wrapper({ children }: Readonly<{ children: ReactNode }>) { return TH.providerTreeOf(world, children, { userid: TH.ProviderUser }) }
    const { result } = renderHook(() => world.Bank.useDraft(TH.JokesPath), { wrapper: Wrapper })
    TH.expectSyncRefusal(() => result.current.whisperField(42 as never), 'bad_record')
    TH.expectSyncRefusal(() => result.current.whisperField(''), 'bad_record')
    await TH.expectRefusal(result.current.put({ sidecarOf: 'mask' as never }), 'bad_record')
  })
})

import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isVaultError, mask } from 'safebyok'
import { useWhisperMask, WhisperMask, type WhisperMaskProps } from '../../src/parts'
import * as TH from '../test-helpers'

/** The joke service's key masked with its last four characters. */
const LiveMask = mask(TH.JokesKey, { tail: 4 })

// The world's key ends in `0000`, which stamps and tokens hold too: this one's tail is found nowhere else.
/** A key with a tail of its own, an obvious fake. */
const TailedKey = 'sk-test-Qz9w'

/** The stored mask the tests read from the box's sidecar: its service. */
function serviceOf(box: Parameters<NonNullable<WhisperMaskProps['ifLocked']>>[0]): string {
  return box.sidecar['service'] as string
}

/** The bank's stage as a line of text, and the joke service's key as a `WhisperMask`. */
function KeyScreen({ world, ...props }: Readonly<{ world: TH.ProviderWorld } & Partial<WhisperMaskProps>>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  return (
    <>
      <p>{stage}</p>
      <WhisperMask labelpath={TH.JokesPath} field="apiKey" tail={4} ifLocked={serviceOf} {...props} />
    </>
  )
}

/** The `KeyScreen`, with the box at `other` loaded beside it, so a change to that box finds its record already cached. */
function OtherCached({ world, labelpath }: Readonly<{ world: TH.ProviderWorld, labelpath: string }>) {
  const other = world.Bank.useBox('other').data
  return (
    <>
      <p>{(other === undefined || other === null) ? 'other loading' : 'other loaded'}</p>
      <KeyScreen world={world} labelpath={labelpath} />
    </>
  )
}

/** A world with the joke service's key stored, rendered under its provider, once it shows the bank locked. */
async function renderKey(props: Partial<WhisperMaskProps> = {}) {
  const world = await TH.buildProviderWorld({ stored: 'jokes' })
  const { container } = render(TH.providerTreeOf(world, <KeyScreen world={world} {...props} />, { userid: TH.ProviderUser }))
  await screen.findByText('locked')
  return { world, container }
}

/** Unlock the world's bank with the stored passphrase. */
async function unlock(world: TH.ProviderWorld): Promise<void> {
  const device = world._cheat_device()
  await act(async () => { await device.bank!.gate.unlock({ passphraseCleartext: TH.TestPassphrase }) })
}

/** The text the mask's element shows. */
function maskTextOf(container: Element): string {
  return container.querySelector('.whisper-mask')?.textContent ?? ''
}

describe("WhisperMask", () => {
  it("shows the stored mask while locked and the live tail while unlocked", async () => {
    const { world, container } = await renderKey()
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: TailedKey } }))
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(TailedKey, { tail: 4 })) })
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
  })

  it("holds neither the key nor its tail in the page or the host's cache", async () => {
    const { world, container } = await renderKey()
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: TailedKey } }))
    const liveMask = mask(TailedKey, { tail: 4 })
    await waitFor(() => { expect(maskTextOf(container)).to.eq(liveMask) })
    TH.expectTextUnheld(TailedKey, container, world.client)
    TH.expectTextUnheld(liveMask, container, world.client)
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
    expect(document.body.textContent.includes(TailedKey.slice(-4))).to.eq(false)
    TH.expectTextUnheld(TailedKey.slice(-4), container, world.client)
  })

  it("shows the stored mask from the moment the bank locks, never blank between", async () => {
    const { world, container } = await renderKey()
    await unlock(world)
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    act(() => { world.Bank.lock() })
    expect(maskTextOf(container)).to.eq('jokes')
  })

  it("keeps the stored mask showing until the live one lands, never blank between", async () => {
    const { world, container } = await renderKey()
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
    await unlock(world)
    expect([ 'jokes', LiveMask ]).to.include(maskTextOf(container))
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
  })

  it("empties the element when the bank locks and ifLocked answers with a promise, never showing the live tail meanwhile", async () => {
    const { world, container } = await renderKey({ ifLocked: (box) => Promise.resolve(serviceOf(box)) })
    await unlock(world)
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    act(() => { world.Bank.lock() })
    expect(maskTextOf(container)).to.eq('')
    await waitFor(() => { expect(maskTextOf(container)).to.eq('jokes') })
  })

  it("empties the element when it is given another box, never showing the last box's mask beside it", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const tree = (labelpath: string) => TH.providerTreeOf(world, <OtherCached world={world} labelpath={labelpath} />, { userid: TH.ProviderUser })
    const { container, rerender } = render(tree(TH.JokesPath))
    await screen.findByText('locked')
    await unlock(world)
    await act(() => world.Bank.putBoxOnce('other', { sidecar: { service: 'other' } }, { whisper: { apiKey: TailedKey } }))
    await screen.findByText('other loaded')
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    rerender(tree('other'))
    expect(maskTextOf(container)).to.eq('')
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(TailedKey, { tail: 4 })) })
  })

  it("empties the element when it is given another tail, never showing the last tail's mask beside it", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const tree = (tail: number) => TH.providerTreeOf(world, <KeyScreen world={world} tail={tail} />, { userid: TH.ProviderUser })
    const { container, rerender } = render(tree(4))
    await screen.findByText('locked')
    await unlock(world)
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    rerender(tree(2))
    expect(maskTextOf(container)).to.eq('')
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(TH.JokesKey, { tail: 2 })) })
  })

  it("writes the mask again when the box is written", async () => {
    const { world, container } = await renderKey()
    await unlock(world)
    await waitFor(() => { expect(maskTextOf(container)).to.eq(LiveMask) })
    const nextKey = 'sk-test-4321'
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { service: 'jokes' } }, { whisper: { apiKey: nextKey } }))
    await waitFor(() => { expect(maskTextOf(container)).to.eq(mask(nextKey, { tail: 4 })) })
  })

  it("shows the sidecar's mask field while locked when no ifLocked is given", async () => {
    // WhisperMask @example
    const { world, container } = await renderKey({ ifLocked: undefined })
    await unlock(world)
    await act(() => world.Bank.putBoxOnce(TH.JokesPath, { sidecar: { mask: 'sk-te*******' } }, { whisper: { apiKey: TH.JokesKey } }))
    act(() => { world.Bank.lock() })
    await waitFor(() => { expect(maskTextOf(container)).to.eq('sk-te*******') })
  })

  it("stays empty for a box that is not stored", async () => {
    const { world, container } = await renderKey({ labelpath: 'other' })
    await unlock(world)
    await screen.findByText('unlocked')
    expect(maskTextOf(container)).to.eq('')
  })

  it("stays empty and reports the refusal when the mask cannot be shown, an Error as it was thrown", async () => {
    const thrown = new TypeError('no mask')
    const onError = vi.fn<(err: Error) => void>()
    const { container } = await renderKey({ ifLocked: () => { throw thrown }, onError })
    await waitFor(() => { expect(onError).toHaveBeenCalledOnce() })
    expect(onError.mock.calls[0]?.[0]).to.eq(thrown)
    expect(maskTextOf(container)).to.eq('')
    expect(isVaultError(onError.mock.calls[0]?.[0])).to.eq(false)
  })

  it("reports a thrown value that is no Error as an Error, the value its cause", async () => {
    const thrown: unknown = { code: 42 }
    const onError = vi.fn<(err: Error) => void>()
    await renderKey({ ifLocked: () => { throw thrown as Error }, onError })
    await waitFor(() => { expect(onError).toHaveBeenCalledOnce() })
    const err = onError.mock.calls[0]?.[0]
    expect(err).to.be.instanceOf(Error)
    expect(err?.cause).to.eq(thrown)
  })
})

/** The joke service's key masked into a `<span>` of the host's own. */
function HostMask({ world }: Readonly<{ world: TH.ProviderWorld }>) {
  const stage = world.Bank.useBank((snap) => snap.stage)
  const { maskRef } = useWhisperMask(TH.JokesPath, 'apiKey', { tail: 4, ifLocked: serviceOf })
  return (
    <>
      <p>{stage}</p>
      <span ref={maskRef} data-testid="host-mask" />
    </>
  )
}

describe("useWhisperMask", () => {
  it("writes the mask into an element of the host's own, stored while locked and live while unlocked", async () => {
    // useWhisperMask @example
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    render(TH.providerTreeOf(world, <HostMask world={world} />, { userid: TH.ProviderUser }))
    await screen.findByText('locked')
    const el = screen.getByTestId('host-mask')
    await waitFor(() => { expect(el.textContent).to.eq('jokes') })
    await unlock(world)
    await waitFor(() => { expect(el.textContent).to.eq(LiveMask) })
    TH.expectTextUnheld(LiveMask, el.parentElement!, world.client)
    act(() => { world.Bank.lock() })
    expect(el.textContent).to.eq('jokes')
  })

  it("writes the mask into an element the host mounts after the box has loaded", async () => {
    const world = await TH.buildProviderWorld({ stored: 'jokes' })
    const { rerender } = render(TH.providerTreeOf(world, <LateHostMask world={world} isShown={false} />, { userid: TH.ProviderUser }))
    await screen.findByText('jokes loaded')
    rerender(TH.providerTreeOf(world, <LateHostMask world={world} isShown={true} />, { userid: TH.ProviderUser }))
    expect(screen.getByTestId('host-mask').textContent).to.eq('jokes')
  })
})

/** The joke service's key masked into a `<span>` of the host's own, rendered only while `isShown`. */
function LateHostMask({ world, isShown }: Readonly<{ world: TH.ProviderWorld, isShown: boolean }>) {
  const box = world.Bank.useBox(TH.JokesPath).data
  const { maskRef } = useWhisperMask(TH.JokesPath, 'apiKey', { tail: 4, ifLocked: serviceOf })
  return (
    <>
      <p>{(box === undefined) ? 'loading' : 'jokes loaded'}</p>
      {isShown && <span ref={maskRef} data-testid="host-mask" />}
    </>
  )
}

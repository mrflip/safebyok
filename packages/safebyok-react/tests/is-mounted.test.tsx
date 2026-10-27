import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, Suspense } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useIsMounted } from '../src/is-mounted'
import * as TH from './test-helpers'

/** A component that hands its useIsMounted to `grab`, and what that answers, as each render sees it. */
const Grabber = ({ grab }: { grab: (isMounted: () => boolean) => void }) => {
  grab(useIsMounted())
  return null
}

/** The useIsMounted @example: a button whose handler awaits `unlocking`, then tells `onDone` only while it is mounted. */
const Unlocker = ({ unlocking, onDone }: { unlocking: () => Promise<undefined>, onDone: (unlocked: boolean) => void }) => {
  const isMounted = useIsMounted()
  const submit = async () => {
    await unlocking()
    if (! isMounted()) { return }
    onDone(true)
  }
  return <button type="button" onClick={() => { void submit() }}>Unlock</button>
}

afterEach(cleanup)

describe("useIsMounted", () => {
  it("answers false while the first render runs, true once committed, and false once unmounted", () => {
    const seen: boolean[] = []
    const grabbed: (() => boolean)[] = []
    const { unmount } = render(<Grabber grab={(isMounted) => { seen.push(isMounted()); grabbed.push(isMounted) }} />)
    const [isMounted = () => false] = grabbed
    expect(seen).to.deep.equal([false])
    expect(isMounted()).to.be.true
    unmount()
    expect(isMounted()).to.be.false
  })

  it("answers true once committed under StrictMode, which mounts, unmounts and mounts again", () => {
    const grabbed: (() => boolean)[] = []
    render(<StrictMode><Grabber grab={(isMounted) => { grabbed.push(isMounted) }} /></StrictMode>)
    expect(grabbed.every((isMounted) => isMounted())).to.be.true
  })

  it("answers true while a Suspense boundary hides the component, which is still mounted", async () => {
    const grabbed: (() => boolean)[] = []
    const grab = (isMounted: () => boolean) => { grabbed.push(isMounted) }
    const hiding = TH.held()
    const shown = (pending: Promise<undefined> | null) => (
      <Suspense fallback={<p>Loading</p>}>
        <TH.Hider hiding={pending} />
        <Grabber grab={grab} />
      </Suspense>
    )
    const { rerender } = render(shown(null))
    await act(async () => {
      rerender(shown(hiding.promise))
      await TH.wakeupAtNextTick()
    })
    expect(screen.getByText('Loading')).to.not.be.null
    expect(grabbed.every((isMounted) => isMounted())).to.be.true
    await act(async () => {
      hiding.resolve(undefined)
      await TH.wakeupAtNextTick()
    })
    expect(screen.queryByText('Loading')).to.be.null
    expect(grabbed.every((isMounted) => isMounted())).to.be.true
  })

  it("keeps one identity across renders, so that it never retriggers an effect", () => {
    const grabbed: (() => boolean)[] = []
    const grab = (isMounted: () => boolean) => { grabbed.push(isMounted) }
    const { rerender } = render(<Grabber grab={grab} />)
    rerender(<Grabber grab={grab} />)
    expect(grabbed).to.have.lengthOf(2)
    expect(grabbed[0]).to.equal(grabbed[1])
  })

  it("lets a handler tell its host once its await settles, while the component is mounted", async () => {
    const unlocking = TH.held()
    const heard: boolean[] = []
    render(<Unlocker unlocking={() => unlocking.promise} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Unlock'))
    await act(async () => {
      unlocking.resolve(undefined)
      await TH.wakeupAtNextTick()
    })
    expect(heard).to.deep.equal([true])
  })

  it("stops a handler whose await settles after the component unmounted", async () => {
    const unlocking = TH.held()
    const heard: boolean[] = []
    const { unmount } = render(<Unlocker unlocking={() => unlocking.promise} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Unlock'))
    unmount()
    await act(async () => {
      unlocking.resolve(undefined)
      await TH.wakeupAtNextTick()
    })
    expect(heard).to.deep.equal([])
  })
})

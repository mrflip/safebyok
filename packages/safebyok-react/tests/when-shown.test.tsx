import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Activity, StrictMode, Suspense, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { useWhenShown } from '../src/when-shown'
import * as TH from './test-helpers'

/** What useWhenShown hands back. */
type WhenShown = ReturnType<typeof useWhenShown>

/** A component that hands its useWhenShown to `grab` at each render. */
const Grabber = ({ grab }: { grab: (whenShown: WhenShown) => void }) => {
  grab(useWhenShown())
  return null
}

/** The useWhenShown @example: a button whose handler awaits `unlocking`, then tells `onDone` once it shows. */
const Unlocker = ({ unlocking, onDone }: { unlocking: () => Promise<undefined>, onDone: (unlocked: boolean) => void }) => {
  const whenShown = useWhenShown()
  const submit = async () => {
    await unlocking()
    await whenShown(() => { onDone(true) })
  }
  return <button type="button" onClick={() => { void submit() }}>Unlock</button>
}

/** A useWhenShown that never goes on, for a test that grabbed none. */
const never: WhenShown = () => new Promise(() => undefined)

/** Hands `whenShown` a handler that only notes it went on, and answers whether it has yet. */
const goesOn = (whenShown: WhenShown) => {
  let gone = false
  void whenShown(() => { gone = true })
  return () => gone
}

/** Calls `committed` from a layout effect, in the commit that shows it. */
const Committing = ({ committed }: { committed: () => void }) => {
  useLayoutEffect(() => { committed() }, [committed])
  return null
}

/** Lets every settled promise's handlers run, and React flush what they asked of it. */
const settle = async () => { await act(async () => { await TH.wakeupAtNextTick() }) }

afterEach(cleanup)

describe("useWhenShown", () => {
  it("goes on at once while the component is committed, and never once it has unmounted", async () => {
    const grabbed: WhenShown[] = []
    const { unmount } = render(<Grabber grab={(whenShown) => { grabbed.push(whenShown) }} />)
    const [whenShown = never] = grabbed
    expect(goesOn(whenShown)()).to.be.true
    unmount()
    const shownOnceGone = goesOn(whenShown)
    await settle()
    expect(shownOnceGone()).to.be.false
  })

  it("goes on at once in the commit that mounts the component, before React runs its passive effects", () => {
    const grabbed: WhenShown[] = []
    const seenInCommit: boolean[] = []
    // Rendered after the Grabber, so its layout effect runs after the Grabber's, in the same commit.
    const InCommit = () => {
      useLayoutEffect(() => { seenInCommit.push(...grabbed.map((whenShown) => goesOn(whenShown)())) }, [])
      return null
    }
    render(<><Grabber grab={(whenShown) => { grabbed.push(whenShown) }} /><InCommit /></>)
    expect(seenInCommit).to.deep.equal([true])
  })

  it("goes on at once under StrictMode, which mounts, unmounts and mounts again", () => {
    const grabbed: WhenShown[] = []
    render(<StrictMode><Grabber grab={(whenShown) => { grabbed.push(whenShown) }} /></StrictMode>)
    expect(grabbed.map((whenShown) => goesOn(whenShown)())).to.not.include(false)
  })

  it("waits while a Suspense boundary hides the component, and goes on once it shows again", async () => {
    const grabbed: WhenShown[] = []
    const grab = (whenShown: WhenShown) => { grabbed.push(whenShown) }
    const hiding = TH.held()
    const shown = (pending: Promise<undefined> | null) => (
      <Suspense fallback={<p>Loading</p>}>
        <TH.Hider hiding={pending} />
        <Grabber grab={grab} />
      </Suspense>
    )
    const { rerender } = render(shown(null))
    const [whenShown = never] = grabbed
    await act(async () => {
      rerender(shown(hiding.promise))
      await TH.wakeupAtNextTick()
    })
    expect(screen.getByText('Loading')).to.not.be.null
    const shownAgain = goesOn(whenShown)
    await settle()
    expect(shownAgain()).to.be.false
    await act(async () => {
      hiding.resolve(undefined)
      await TH.wakeupAtNextTick()
    })
    expect(screen.queryByText('Loading')).to.be.null
    expect(shownAgain()).to.be.true
  })

  it("waits while an Activity hides the component, and goes on once it shows again", async () => {
    const grabbed: WhenShown[] = []
    const grab = (whenShown: WhenShown) => { grabbed.push(whenShown) }
    const shown = (mode: 'visible' | 'hidden') => <Activity mode={mode}><Grabber grab={grab} /></Activity>
    const { rerender } = render(shown('visible'))
    const [whenShown = never] = grabbed
    rerender(shown('hidden'))
    const shownAgain = goesOn(whenShown)
    await settle()
    expect(shownAgain()).to.be.false
    rerender(shown('visible'))
    await settle()
    expect(shownAgain()).to.be.true
  })

  it("waits again for a component an Activity hides once more in the commit that showed it", async () => {
    const grabbed: WhenShown[] = []
    const grab = (whenShown: WhenShown) => { grabbed.push(whenShown) }
    const rehid: true[] = []
    // Shown in `mode`, unless `rehiding` and a layout effect in the commit that showed it hid it
    // again: React renders that update before any microtask runs.
    const Host = ({ mode, rehiding }: { mode: 'visible' | 'hidden', rehiding: boolean }) => {
      const [hiddenAgain, setHiddenAgain] = useState(false)
      const rehide = () => {
        if (! rehiding || hiddenAgain) { return }
        rehid.push(true)
        setHiddenAgain(true)
      }
      return (
        <Activity mode={rehiding && hiddenAgain ? 'hidden' : mode}>
          <Grabber grab={grab} />
          <Committing committed={rehide} />
        </Activity>
      )
    }
    const { rerender } = render(<Host mode="visible" rehiding={false} />)
    const [whenShown = never] = grabbed
    rerender(<Host mode="hidden" rehiding={false} />)
    const shownAgain = goesOn(whenShown)
    await act(async () => {
      rerender(<Host mode="visible" rehiding />)
      await TH.wakeupAtNextTick()
    })
    expect(rehid).to.have.lengthOf(1)
    expect(shownAgain()).to.be.false
    rerender(<Host mode="visible" rehiding={false} />)
    await settle()
    expect(shownAgain()).to.be.true
  })

  it("never goes on for a component an Activity hid, then its host unmounted", async () => {
    const grabbed: WhenShown[] = []
    const grab = (whenShown: WhenShown) => { grabbed.push(whenShown) }
    const { rerender, unmount } = render(<Activity mode="visible"><Grabber grab={grab} /></Activity>)
    const [whenShown = never] = grabbed
    rerender(<Activity mode="hidden"><Grabber grab={grab} /></Activity>)
    const shownAgain = goesOn(whenShown)
    unmount()
    await settle()
    expect(shownAgain()).to.be.false
  })

  it("hands back what the handler returns, awaited, and what it throws as a rejection", async () => {
    const grabbed: WhenShown[] = []
    render(<Grabber grab={(whenShown) => { grabbed.push(whenShown) }} />)
    const [whenShown = never] = grabbed
    expect(await whenShown(() => Promise.resolve('unlocked'))).to.eq('unlocked')
    await expect(whenShown(() => { throw new Error('the host threw') })).rejects.toThrow('the host threw')
  })

  it("keeps one identity across renders, so that it never retriggers an effect", () => {
    const grabbed: WhenShown[] = []
    const grab = (whenShown: WhenShown) => { grabbed.push(whenShown) }
    const { rerender } = render(<Grabber grab={grab} />)
    rerender(<Grabber grab={grab} />)
    expect(grabbed).to.have.lengthOf(2)
    expect(grabbed[0]).to.equal(grabbed[1])
  })

  it("lets a handler tell its host once its await settles, while the component shows, as its example has it", async () => {
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

  it("holds a handler whose await settles while an Activity hides the component, until it shows again", async () => {
    const unlocking = TH.held()
    const heard: boolean[] = []
    const shown = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}><Unlocker unlocking={() => unlocking.promise} onDone={(unlocked) => { heard.push(unlocked) }} /></Activity>
    )
    const { rerender } = render(shown('visible'))
    fireEvent.click(screen.getByText('Unlock'))
    rerender(shown('hidden'))
    await act(async () => {
      unlocking.resolve(undefined)
      await TH.wakeupAtNextTick()
    })
    expect(heard).to.deep.equal([])
    rerender(shown('visible'))
    await settle()
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

  it("stops a handler whose await settles in the commit that unmounts the component, before React runs its passive effects", async () => {
    // Outside act, as a page runs: React runs a commit's passive effects in a task of their own,
    // after the microtasks the commit's own task queued.
    const actWas: unknown = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false)
    onTestFinished(() => { Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actWas) })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    onTestFinished(() => { root.unmount(); container.remove() })
    const unlocking = TH.held()
    const heard: boolean[] = []
    const mounted = TH.held()
    const unmounted = TH.held()
    root.render(<><Unlocker unlocking={() => unlocking.promise} onDone={(unlocked) => { heard.push(unlocked) }} /><Committing committed={() => { mounted.resolve(undefined) }} /></>)
    await mounted.promise
    await TH.wakeupAtNextTick()
    const button = container.querySelector('button')
    expect(button).to.not.be.null
    button?.click()
    // The attempt settles in the very commit that takes the Unlocker away.
    root.render(<Committing committed={() => { unlocking.resolve(undefined); unmounted.resolve(undefined) }} />)
    await unmounted.promise
    await TH.wakeupAtNextTick()
    expect(heard).to.deep.equal([])
  })
})

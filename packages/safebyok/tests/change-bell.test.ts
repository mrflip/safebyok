import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import * as ChangeBell from '../src/change-bell'
import * as TH from './test-helpers'

/** A bell of its own for each test, named as an IndexedDB store's is. */
const freshBell = () => `safebyok-idb:${TH.freshDbName()}:vault_db`

describe("ChangeBell", () => {
  it("calls every listener of the bell rung, and only that bell's", async () => {
    const bellname = freshBell()
    const heard: string[] = []
    const stops = [
      ChangeBell.listen(bellname, () => { heard.push('one') }),
      ChangeBell.listen(bellname, () => { heard.push('two') }),
      ChangeBell.listen(freshBell(), () => { heard.push('elsewhere') }),
    ]
    ChangeBell.ring(bellname)
    await vi.waitFor(() => { expect(heard).to.have.members(['one', 'two']) })
    await TH.wakeupAtNextTick()
    expect(heard).to.have.members(['one', 'two'])
    for (const stop of stops) { stop() }
  })

  it("calls listeners after the ringing code has run on, never during it", () => {
    const bellname = freshBell()
    let heardCount = 0
    const stop = ChangeBell.listen(bellname, () => { heardCount += 1 })
    ChangeBell.ring(bellname)
    expect(heardCount).to.eq(0)
    stop()
  })

  it("stops calling a listener once it is unsubscribed, and keeps calling the rest", async () => {
    const bellname = freshBell()
    const heard: string[] = []
    const stopOne = ChangeBell.listen(bellname, () => { heard.push('one') })
    const stopTwo = ChangeBell.listen(bellname, () => { heard.push('two') })
    stopOne()
    ChangeBell.ring(bellname)
    await vi.waitFor(() => { expect(heard).to.deep.equal(['two']) })
    stopTwo()
  })

  it("calls no listener unsubscribed after the ring but before its turn came", async () => {
    const bellname = freshBell()
    const heard: string[] = []
    const stopOne = ChangeBell.listen(bellname, () => { heard.push('one') })
    const stopTwo = ChangeBell.listen(bellname, () => { heard.push('two') })
    ChangeBell.ring(bellname)
    stopOne()
    await vi.waitFor(() => { expect(heard).to.deep.equal(['two']) })
    await TH.wakeupAtNextTick()
    expect(heard).to.deep.equal(['two'])
    stopTwo()
  })

  it("carries a ring between two tabs' channels, never back to the tab that rang", async () => {
    const bellname = freshBell()
    const otherTab = new BroadcastChannel(bellname)
    const otherHeard: unknown[] = []
    otherTab.addEventListener('message', (event) => { otherHeard.push(event.data) })
    let heardHere = 0
    const stop = ChangeBell.listen(bellname, () => { heardHere += 1 })
    ChangeBell.ring(bellname)
    await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    await TH.wakeupAtNextTick()
    expect(heardHere).to.eq(1)
    stop()
    otherTab.close()
  })

  it("rings this tab's listeners alone where the platform has no BroadcastChannel", async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    try {
      const bellname = freshBell()
      let heardCount = 0
      const stop = ChangeBell.listen(bellname, () => { heardCount += 1 })
      ChangeBell.ring(bellname)
      await vi.waitFor(() => { expect(heardCount).to.eq(1) })
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("hands what a listener threw to the platform's reportError, where there is one", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const bellname = freshBell()
      const thrown = new Error('a listener that throws')
      const stop = ChangeBell.listen(bellname, () => { throw thrown })
      ChangeBell.ring(bellname)
      await vi.waitFor(() => { expect(reported).to.deep.equal([thrown]) })
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports a listener that throws something other than an Error as an Error holding it as its cause", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const bellname = freshBell()
      const stop = ChangeBell.listen(bellname, () => { throw 'a string, thrown' }) // eslint-disable-line @typescript-eslint/only-throw-error
      ChangeBell.ring(bellname)
      await vi.waitFor(() => { expect(reported).to.have.lengthOf(1) })
      expect(reported[0]).to.be.instanceOf(Error).with.property('cause', 'a string, thrown')
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("calls the other listeners when one throws, and lets nothing escape as an uncaught error", async () => {
    const bellname = freshBell()
    const heard: string[] = []
    const stops = [
      ChangeBell.listen(bellname, () => {
        heard.push('one')
        throw new Error('a listener that throws')
      }),
      ChangeBell.listen(bellname, () => { heard.push('two') }),
    ]
    ChangeBell.ring(bellname)
    await vi.waitFor(() => { expect(heard).to.deep.equal(['one', 'two']) })
    await TH.wakeupAtNextTick()
    for (const stop of stops) { stop() }
  })

  it("closes its channel when its last listener leaves, and opens it afresh for the next", async () => {
    const bellname = freshBell()
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      const stopOne = ChangeBell.listen(bellname, () => undefined)
      const stopTwo = ChangeBell.listen(bellname, () => undefined)
      stopOne()
      expect(closing).not.toHaveBeenCalled()
      stopTwo()
      expect(closing).toHaveBeenCalledTimes(1)
      const otherTab = new BroadcastChannel(bellname)
      let heardCount = 0
      const stopThree = ChangeBell.listen(bellname, () => { heardCount += 1 })
      otherTab.postMessage('changed')
      await vi.waitFor(() => { expect(heardCount).to.eq(1) })
      stopThree()
      otherTab.close()
    } finally {
      closing.mockRestore()
    }
  })

  it("rings other tabs for a write nothing here listens to, then closes the channel it opened", async () => {
    const bellname = freshBell()
    const otherTab = new BroadcastChannel(bellname)
    const otherHeard: unknown[] = []
    otherTab.addEventListener('message', (event) => { otherHeard.push(event.data) })
    const closing = vi.spyOn(BroadcastChannel.prototype, 'close')
    try {
      ChangeBell.ring(bellname)
      expect(closing).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => { expect(otherHeard).to.deep.equal(['changed']) })
    } finally {
      closing.mockRestore()
      otherTab.close()
    }
  })

  it("unrefs its channel where the platform's has unref, so it never holds a process open", () => {
    const unrefs = vi.fn()
    class NodeLikeChannel extends EventTarget {
      postMessage = vi.fn()
      close = vi.fn()
      unref = unrefs
    }
    vi.stubGlobal('BroadcastChannel', NodeLikeChannel)
    try {
      const stop = ChangeBell.listen(freshBell(), () => undefined)
      ChangeBell.ring(freshBell())
      expect(unrefs).toHaveBeenCalledTimes(2)
      stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lets a Node process that rang it exit on its own, a throwing listener and all", () => {
    const bellUrl = new URL('../src/change-bell.ts', import.meta.url).href
    const script = `
      const ChangeBell = await import(${JSON.stringify(bellUrl)})
      ChangeBell.listen('exits', () => { throw new Error('a listener that throws') })
      ChangeBell.ring('exits')
    `
    const ran = spawnSync(process.execPath, ['--import', SourceImports, '--input-type=module', '--no-warnings', '--eval', script], { encoding: 'utf8', timeout: 10_000 })
    expect(ran.signal, 'the process was still running after ten seconds').to.be.null
    expect(ran.stderr).to.eq('')
    expect(ran.status).to.eq(0)
  })
})

// The source imports its siblings without an extension, as a bundler resolves them; plain Node
// needs the `.ts` spelled out, which this resolve hook, registered before the script runs, adds.
const ResolveHook = `export const resolve = async (specifier, context, next) => {
  try { return await next(specifier, context) } catch (err) {
    if (specifier.startsWith('.') && ! specifier.endsWith('.ts')) { return next(specifier + '.ts', context) }
    throw err
  }
}`
const asDataUrl = (moduleSource: string) => `data:text/javascript,${encodeURIComponent(moduleSource)}`
const SourceImports = asDataUrl(`import { register } from 'node:module'; register(${JSON.stringify(asDataUrl(ResolveHook))})`)

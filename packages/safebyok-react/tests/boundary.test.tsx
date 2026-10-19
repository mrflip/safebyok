import { screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { VaultError } from 'safebyok'
import { Boundary, forBoundary, useRoundFor } from '../src/boundary'
import * as TH from './test-helpers'

/** A child that throws `failure.err` while rendering, or shows "fine" when it has no failure. */
const Thrower = ({ failure }: { failure?: { err: unknown } }) => {
  if (failure !== undefined) { throw failure.err }
  return <p>fine</p>
}

/** A host's own boundary, above ours: shows "host caught" if anything reaches it. */
class HostBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  override state = { caught: false }
  static getDerivedStateFromError() { return { caught: true } }
  override render() { return this.state.caught ? <p>host caught</p> : this.props.children }
}

describe("Boundary", () => {
  it("shows its children while nothing throws, and tells no one", () => {
    const told: string[] = []
    const { reported } = TH.renderReporting(<Boundary fallback={<p>Something went wrong.</p>} onCaught={() => { told.push('caught') }}><Thrower /></Boundary>)
    expect(screen.queryByText('fine')).to.not.be.null
    expect(screen.queryByText('Something went wrong.')).to.be.null
    expect(told).to.deep.equal([])
    expect(reported).to.deep.equal([])
  })

  it("shows the fallback in place of a child that throws, and React reports the very error", () => {
    const fell = new TypeError('fell over')
    const { reported } = TH.renderReporting(<HostBoundary><Boundary fallback={<p>Something went wrong.</p>}><Thrower failure={{ err: fell }} /></Boundary></HostBoundary>)
    expect(screen.queryByText('Something went wrong.')).to.not.be.null
    expect(screen.queryByText('host caught')).to.be.null
    expect(reported).to.have.lengthOf(1)
    expect(reported[0]).to.equal(fell)
  })

  it("tells onCaught once, and a null fallback leaves nothing in the children's place", () => {
    const told: string[] = []
    const { container, reported } = TH.renderReporting(<Boundary fallback={null} onCaught={() => { told.push('caught') }}><Thrower failure={{ err: new Error('fell over') }} /></Boundary>)
    expect(container.childNodes).to.have.lengthOf(0)
    expect(told).to.deep.equal(['caught'])
    expect(reported).to.have.lengthOf(1)
  })

  it("keeps the fallback while it stays mounted, even once its children would render", () => {
    const { rerender } = TH.renderReporting(<Boundary fallback={<p>Something went wrong.</p>}><Thrower failure={{ err: new Error('fell over') }} /></Boundary>)
    rerender(<Boundary fallback={<p>Something went wrong.</p>}><Thrower /></Boundary>)
    expect(screen.queryByText('Something went wrong.')).to.not.be.null
    expect(screen.queryByText('fine')).to.be.null
  })

  it("catches a thrown value that is no Error at all", () => {
    const { reported } = TH.renderReporting(<Boundary fallback={<p>Something went wrong.</p>}><Thrower failure={{ err: null }} /></Boundary>)
    expect(screen.queryByText('Something went wrong.')).to.not.be.null
    expect(reported).to.deep.equal([null])
  })
})

/** The example's shape: a boundary keyed by the handle it serves, over a child that fails for one handle. */
const Served = ({ handle, failing }: { handle: object, failing: object }) => (
  <Boundary key={useRoundFor(handle)} fallback={<p>fallback</p>}>
    <Thrower {...(handle === failing ? { failure: { err: new Error('broke') } } : {})} />
  </Boundary>
)

describe("useRoundFor", () => {
  it("starts a boundary afresh for another handle, and keeps it as it is for the same one", () => {
    const first = {}
    const second = {}
    const { rerender } = TH.renderReporting(<Served handle={first} failing={first} />)
    expect(screen.queryByText('fallback')).to.not.be.null
    rerender(<Served handle={first} failing={second} />)
    expect(screen.queryByText('fallback')).to.not.be.null
    rerender(<Served handle={second} failing={first} />)
    expect(screen.queryByText('fine')).to.not.be.null
  })
})

/** A child that fails as the dialog does: `err` thrown in render through forBoundary. */
const ForBoundaryThrower = ({ err }: { err: unknown }) => { throw forBoundary(err) }

describe("forBoundary", () => {
  const meta = { capacity: { boxes: { used: 1, max: 100 }, bytes: { used: 48, max: 1000 } } }

  it("hands React a VaultError's kind, message and meta but not its cause, thrown in render, as its example shows", () => {
    const misuse = new VaultError('bad_option', 'A bad option.', { cause: new Error('could not derive from pw-the-passphrase'), meta })
    const { reported } = TH.renderReporting(<Boundary fallback={<p>Something went wrong.</p>}><ForBoundaryThrower err={misuse} /></Boundary>)
    expect(screen.queryByText('Something went wrong.')).to.not.be.null
    expect(reported).to.have.lengthOf(1)
    const told = reported[0] as VaultError
    expect(told).to.be.instanceOf(VaultError).and.to.include({ refusalkind: 'bad_option', message: 'A bad option.' })
    expect(told.meta).to.deep.equal(meta)
    expect(told.cause).to.be.undefined
  })

  it("hands back a VaultError with no cause as itself", () => {
    const misuse = new VaultError('bad_option', 'A bad option.', { meta })
    expect(forBoundary(misuse)).to.equal(misuse)
  })

  const ForeignCases = [
    [new TypeError('could not judge pw-the-passphrase'),  'turns an Error that quotes what it was handed into a fixed unexpected_error quoting none of it'],
    ["pw-the-passphrase",                                 'turns a bare string into a fixed unexpected_error quoting none of it'],
    [null,                                                'turns null into a fixed unexpected_error'],
  ] as const

  for (const [thrown, blurb] of ForeignCases) {
    it(blurb, () => {
      const told = forBoundary(thrown)
      expect(told).to.be.instanceOf(VaultError).and.to.include({ refusalkind: 'unexpected_error' })
      expect(told.message).to.not.include('pw-the-passphrase')
      expect(told.cause).to.be.undefined
    })
  }
})

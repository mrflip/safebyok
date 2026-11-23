import { fireEvent, render, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PostMethodCard } from '../../../src/components/practice/PostMethodCard'
import * as World from './world'

// The method card, today, and what react-dom's server renderer writes for each kind of form, by renderToString under
// jsdom. What a browser does with a form submitted before React attaches is HTML's, read, not run. A change here is news
// for whiteboard/20261123-dojo/dojo-findings.md.

/** The `<form …>` start tag of the first form in `html`. */
function formTagOf(html: string): string { return /<form[^>]*>/u.exec(html)?.[0] ?? '' }

describe("the method card, today", () => {
  it("the card's form is rendered on a server with method post", () => {
    expect(formTagOf(renderToString(<PostMethodCard />))).to.eq('<form aria-label="Posted if early" method="post">')
  })

  it("a form that submits from onSubmit is rendered on a server with no method, which a browser sends as a GET", () => {
    const html = renderToString(<form onSubmit={() => { /* never attached */ }}><input name="apiKey" /></form>)
    expect(formTagOf(html)).to.eq('<form>')
    document.body.innerHTML = html
    expect(document.querySelector('form')?.method).to.eq('get')
  })

  it("a form Action is rendered on a server with a javascript: action and no method, and a script that holds an early submit", () => {
    const html = renderToString(<form action={() => { /* never attached */ }}><input name="apiKey" /></form>)
    expect(formTagOf(html)).to.eq(`<form action="javascript:throw new Error(&#x27;React form unexpectedly submitted.&#x27;)">`)
    expect(html).to.include('$$reactFormReplay')
  })

  it("a method given beside a function action is warned of, and left out on a server", () => {
    const warned = vi.spyOn(console, 'error').mockImplementation(() => { /* kept from the output */ })
    const html = renderToString(<form action={() => { /* never attached */ }} method="post"><input name="apiKey" /></form>)
    expect(formTagOf(html)).not.to.include('method')
    expect(warned.mock.calls.map(([message]) => String(message))).to.include('Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden.')
  })

  it("a submit in the page is handled there", () => {
    render(<PostMethodCard />)
    const shown = World.example(document.body, 'Do: method="post" on a form that submits from onSubmit')
    fireEvent.click(within(shown).getByRole('button', { name: 'Save' }))
    expect(within(shown).getByRole('status').textContent).to.eq('Submits handled in the page: 1. The browser sent nothing.')
  })
})

/** The Forms tab's second mirror: plain code on the host's mutation cache, outside React, showing beside a row what a mutation's variables held as it went pending. */

import type { MutationCache } from '@tanstack/react-query'

/** Write, into a Forms row's variables cell, what each mutation started while that row's form submits held in its variables as TanStack told its cache's subscribers it was pending, until the function it answers is called. */
export function startVariablesMirror(cache: MutationCache): () => void {
  // A submit reaches the window's capture listener before any of React's, and its bubble listener after them, so a mutation
  // a row starts from its onSubmit or its form Action goes pending between the two.
  let submitting: HTMLFormElement | null = null
  function onSubmitStart(event: Event) { submitting = (event.target instanceof HTMLFormElement) ? event.target : null }
  function onSubmitEnd() { submitting = null }
  globalThis.addEventListener('submit', onSubmitStart, { capture: true })
  globalThis.addEventListener('submit', onSubmitEnd)
  const unsubscribe = cache.subscribe((event) => {
    if ((event.type !== 'updated') || (event.action.type !== 'pending')) { return }
    const cell = submitting?.querySelector('[data-variables]')
    if (cell) { cell.textContent = `when pending: ${variablesTextOf(event.action.variables)}` }
  })
  return () => {
    unsubscribe()
    globalThis.removeEventListener('submit', onSubmitStart, { capture: true })
    globalThis.removeEventListener('submit', onSubmitEnd)
  }
}

/** What the variables cell shows of a mutation's variables: a form's fields and their text, or the value as JSON. */
function variablesTextOf(variables: unknown): string {
  if (variables instanceof FormData) { return JSON.stringify([...variables].map(([fieldname, val]) => [fieldname, (typeof val === 'string') ? val : '(file)'])) }
  return (variables === undefined) ? '(none)' : JSON.stringify(variables)
}

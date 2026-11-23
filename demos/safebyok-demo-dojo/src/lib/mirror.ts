/** The Forms tab's mirror: plain DOM code, outside React, showing beside each row where its secret's text can be read from the page right now. index.html starts it. */

/** Write, into each Forms row's mirror cell, the text of its secret input as the DOM shows it: the input's `value` property, and its `value` attribute. */
export function mirrorSecrets(root: ParentNode = document): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-secret]')) {
    const cell = input.form?.querySelector('[data-mirror]')
    const mirrorText = mirrorTextOf(input)
    // Written only when it changes, so a watcher of the page's changes (a test's waitFor, the Elements panel) is not woken for nothing.
    if (cell && (cell.textContent !== mirrorText)) { cell.textContent = mirrorText }
  }
}

/** Mirror every row's secret every `everyMs` milliseconds, until the function it answers is called. */
export function startMirror(everyMs = 200): () => void {
  const timer = setInterval(() => { mirrorSecrets() }, everyMs)
  return () => { clearInterval(timer) }
}

/** What the mirror shows of `input`: what script reads from it, and what a serialized page (the Elements panel, a session replay) shows. */
function mirrorTextOf(input: HTMLInputElement): string {
  const attribute = input.getAttribute('value')
  return `value: ${input.value ? JSON.stringify(input.value) : '(empty)'} | attribute: ${(attribute === null) ? '(none)' : JSON.stringify(attribute)}`
}

import { useState } from 'react'
import { WhisperInput } from 'safebyok-react/parts'
import { Example, PracticeCard } from './PracticeCard'

/** Give a form that submits from `onSubmit` the attribute `method="post"`, so a submit before React attaches puts nothing in the URL. */
export function PostMethodCard() {
  const [handledCount, setHandledCount] = useState(0)
  return (
    <PracticeCard
      title={'Give an onSubmit form method="post"'}
      why={<>
        <p>On a server-rendered page, a form can be submitted before React attaches. One that submits from <code>onSubmit</code> is then a plain HTML form, and with no <code>method</code> the browser sends it as a GET: every field, the key included, lands in the URL, the history and the server&apos;s logs. With <code>method=&quot;post&quot;</code> the fields go in the request&apos;s body instead, still to the server, but out of the URL.</p>
        <p>A form Action needs nothing: React renders its <code>action</code> as a <code>javascript:</code> URL that throws, and a small script that holds an early submit until React attaches. Give it no <code>method</code>: React warns, and overrides it.</p>
      </>}
    >
      <Example caption={'method="post" on a form that submits from onSubmit'}>
        <form aria-label="Posted if early" method="post" onSubmit={(event) => { event.preventDefault(); event.currentTarget.reset(); setHandledCount((prior) => prior + 1) }}>
          <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
          <button type="submit">Save</button>
          <p role="status">{(handledCount > 0) && `Submits handled in the page: ${String(handledCount)}. The browser sent nothing.`}</p>
        </form>
      </Example>
    </PracticeCard>
  )
}

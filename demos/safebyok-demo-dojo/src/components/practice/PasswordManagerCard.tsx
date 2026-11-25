import { UnlockForm } from 'safebyok-react/kit'
import { WhisperInput } from 'safebyok-react/parts'
import { WhisperFieldAttributes } from 'safebyok/utils'
import { Dojo } from '../../lib/dojo'
import { Example, PracticeCard } from './PracticeCard'

/** The markup a passphrase form of your own renders for a password manager: the kit's fields, in a form that posts if submitted before React attaches. */
const InvitingMarkup = [
  '<form method="post">  <!-- a form Action: no method -->',
  '  <input type="text" name="username" autocomplete="username" value="…" readonly hidden>',
  '  <input type="password" name="passphrase" autocomplete="current-password">',
  '  <!-- choosing one: autocomplete="new-password", on it and on its confirmation -->',
  '</form>',
].join('\n')

/** Invite a password manager to the vault's passphrase, and keep one away from a stored key: the kit's unlock form beside a whisper's field. */
export function PasswordManagerCard({ userid }: Readonly<{ userid: string | null }>) {
  return (
    <PracticeCard
      title="Invite a password manager to the passphrase, and disinvite it from a key"
      why={<>
        <p>The vault&apos;s passphrase is one the user must not lose: let a password manager save and fill it. Give it a real form, real <code>name</code>s, <code>current-password</code> for the passphrase the user has and <code>new-password</code> for one being chosen, and a username field to file it under. The kit&apos;s forms do all of this when handed <code>username</code>; the hidden username field they use is not exported, so a form of your own writes its one line.</p>
        <p>A stored key is not the site&apos;s password: a manager that saves it would offer it at the next sign-in, or overwrite the real one. <code>WhisperFieldAttributes</code> from <code>safebyok/utils</code> (which <code>WhisperInput</code> spreads) asks each major manager to leave the field alone. Name the field for what it holds, never <code>password</code>, <code>key</code> or <code>token</code>. A browser&apos;s built-in manager may honor none of it: Chrome&apos;s still offers a saved password for a <code>type=&quot;password&quot;</code> field marked <code>off</code>.</p>
      </>}
    >
      <Example caption="the passphrase, for a password manager to save">
        <UnlockForm bank={Dojo} username={userid ?? undefined} />
        <pre><code>{InvitingMarkup}</code></pre>
      </Example>
      <Example caption="a stored key, kept from password managers">
        <WhisperInput name="apiKey" aria-label="API key" placeholder="API key" />
        <pre><code>{Object.entries(WhisperFieldAttributes).map(([attrname, attrval]) => `${attrname}="${attrval}"`).join('\n')}</code></pre>
      </Example>
    </PracticeCard>
  )
}

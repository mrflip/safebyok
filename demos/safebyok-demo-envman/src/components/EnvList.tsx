import { Envman } from '../lib/sok'
import { EnvRow } from './EnvRow'

/** Every env in the vault, a row each, in label order. */
export function EnvList() {
  const { data: labelpaths } = Envman.useBoxList()
  return (
    <section aria-labelledby="list-title" className="card">
      <h2 id="list-title">Your secrets</h2>
      {(labelpaths === undefined) && <p className="quiet">Looking for your secrets…</p>}
      {(labelpaths?.length === 0) && <p className="quiet">No secrets yet.</p>}
      <ul className="envs">
        {labelpaths?.map((labelpath) => <EnvRow key={labelpath} labelpath={labelpath} />)}
      </ul>
    </section>
  )
}

import { get, setWith } from 'es-toolkit/compat'
import { hasModelkind } from '../helpers/consts'
import * as Phrases from '../helpers/phrases'
import { Checker } from '../helpers/validator'
import type { Box } from '../models/box'
import { VaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { notExposedError } from '../refusals/throwers'
import type { Whisper } from '../shapes/shapes-core'
import type { BoxPutOpts } from '../shapes/shapes-vaultish'

// == [Shapes]: BoxFieldEl, BoxFieldRef, fieldsBox, fieldPath, BoundField

/** What a field writes to: anything with a `value` string, as an `<input>` is. */
export type BoxFieldEl = { value: string }

/** What `fields.bind` answers: a React 19 ref callback, which binds an element and answers how to unbind it. */
export type BoxFieldRef = (el: BoxFieldEl | null) => (() => void) | undefined

/** The check of `BoxFields.of`'s box. */
const fieldsBox = Checker(({ custom }) => custom<Box>((val) => hasModelkind(val, 'box'), Phrases.BoxExpected), 'bad_option')

/** The check of `fields.bind`'s path, dotted into the whisper. */
const fieldPath = Checker(({ str }) => str.min(1), 'bad_option')

/** An element bound, and the text it was last given: null while hidden, so that what is typed there is never read back. */
interface BoundField {
  readonly el:   BoxFieldEl
  readonly path: string
  shown:         string | null
}
// --

/** The one `BoxFields` of each box, so that every caller shares its fields and its last unbind. */
const fieldsOfBox = new WeakMap<Box, BoxFields>()

/** The elements bound to a box's whisper, each with a leaf of it while it shows and a blank while it does not. */
export class BoxFields {
  // == [Props]: box, #refs, #fields, #stopHearing

  readonly box: Box
  // A React re-render handed a new callback would unbind the old one, and so unexpose.
  /** The ref callback `bind` has answered for each path. */
  readonly #refs = new Map<string, BoxFieldRef>()
  readonly #fields = new Set<BoundField>()
  #stopHearing: (() => void) | null = null

  private constructor(box: Box) { this.box = box }
  // --

  // == [Fields]: of, bind, put, tryPut

  /** The fields of `box`, the same instance at every call. */
  static of(box: Box): BoxFields {
    const checked = fieldsBox.parse(box)
    const fields = fieldsOfBox.get(checked) ?? new BoxFields(checked)
    fieldsOfBox.set(checked, fields)
    return fields
  }

  /** A ref callback showing the whisper at dotted `path` in an element, blank while it will not show; the last unbind unexposes. */
  bind(path: string): BoxFieldRef {
    const checkedPath = fieldPath.parse(path)
    const ref = this.#refs.get(checkedPath) ?? ((el) => ((el === null) ? undefined : this.#bindField({ el, path: checkedPath, shown: null })))
    this.#refs.set(checkedPath, ref)
    return ref
  }

  /** Read each bound field over the whisper exposed, and seal it in one put. */
  async put(opts: BoxPutOpts = {}): Promise<Box> {
    if (this.#fields.size === 0) { throw noFieldsBound() }
    const { isExposed, isVeiled } = this.box.snapshot
    if (! isExposed) { throw notExposedError() }
    if (isVeiled) { throw puttingVeiledFields() }
    this.#readFields()
    return this.box.putExposed({}, opts)
  }

  /** Non-throwing form of {@link put}. */
  tryPut(opts: BoxPutOpts = {}): Promise<Outcome<Box>> { return outcomeOf(() => this.put(opts)) }
  // --

  // == [Binding]: bindField, unbindField, renderFields, readFields

  #bindField(field: BoundField): () => void {
    this.#fields.add(field)
    this.#stopHearing ??= this.box.subscribe(() => { this.#renderFields() })
    this.#renderFields()
    return () => { this.#unbindField(field) }
  }

  #unbindField(field: BoundField): void {
    this.#fields.delete(field)
    field.el.value = ''
    if (this.#fields.size > 0) { return }
    this.#stopHearing?.()
    this.#stopHearing = null
    this.box.unexpose()
  }

  /** Bring every field up to the whisper; on the way into hiding, an edit is read into the value first, to come back with it. */
  #renderFields(): void {
    if (this.box.isShowing) {
      const { whisper } = this.box
      for (const field of this.#fields) {
        const text = fieldTextOf(get(whisper, field.path))
        if (field.shown === text) { continue }
        field.el.value = text
        field.shown = text
      }
      return
    }
    if (this.box.snapshot.isExposed) { this.#readFields() }
    for (const field of this.#fields) {
      field.el.value = ''
      field.shown = null
    }
  }

  /** Patch each edited field into the whisper exposed, as one patch: a text left as shown leaves its leaf, a number say, alone. */
  #readFields(): void {
    const edited = [...this.#fields].filter((field) => (field.shown !== null) && (field.el.value !== field.shown))
    if (edited.length === 0) { return }
    const patch: Whisper = {}
    for (const field of edited) {
      setWith(patch, field.path, field.el.value, Object)
      // Marked as read before the patch, whose tell renders the fields again.
      field.shown = field.el.value
    }
    this.box.patchWhisper(patch)
  }
  // --
}

// == [Helpers]: fieldTextOf, noFieldsBound, puttingVeiledFields

/** What a field shows of a leaf: its text, and a blank for an object, a list or nothing there. */
const fieldTextOf = (leaf: unknown): string => {
  if (typeof leaf === 'string') { return leaf }
  return ((typeof leaf === 'number') || (typeof leaf === 'boolean')) ? String(leaf) : ''
}

const noFieldsBound = (): VaultError => new VaultError('bad_option', Phrases.NoFieldsBound)

const puttingVeiledFields = (): VaultError => new VaultError('bad_option', Phrases.PuttingVeiledFields)
// --

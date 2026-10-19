# Thread B1: proof_wayin (2026-10-19)

Branch `20261019-proof_wayin`, PR pending, stacked on
[#195](https://github.com/mrflip/safebyok/pull/195) (`20261019-outcome_adapters`). Justify: green
at the first milestone.

* **Built**:
  * `adorn(obj, ckey, val)` and `decorate(obj, props)` in `packages/safebyok/src/utils.ts`, with
    tests, in a commit of their own (B3 needs the same two).
* **Deviations**:
  * **`adorn` takes a `ckey`.** The preplan and the Contract write `adorn<VT>(obj, val: VT): VT`,
    which has no name to define the property under; built as the Coach's own helper in triquet
    (`src/lib/props.ts`) reads, `adorn<VT>(obj: object, ckey: string, val: VT): VT`. `decorate`
    is as the preplan reads.

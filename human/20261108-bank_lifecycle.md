# 20261108-bank_lifecycle: open questions

[#597](https://github.com/mrflip/safebyok/pull/597) holds the bank-lifecycle redesign and the BankProvider rework from the provider_interactive session.

* **The `eslint-disable-next-line react-hooks/set-state-in-effect`** on `setContextValue` in `useHeldBank`. The rule guards against storing derived state. Here it costs one synchronous re-render per user or device, because the bank lives only between the layout effect and its cleanup. The Coach means to come back to it.
* **Not done:**
  * after a panic's vacate, the spent bank is kept until the user changes, because remaking it could loop;
  * `useVault` answers `'waiting'` forever on a spent bank;
  * the deviceDB is never dropped, and its device row is not forgotten on vacate.
* **Accusations for the fate makeover:**
  * `Listing.deliver` awaits around work that is synchronous;
  * the lazy `Vault.boxListing` getter, with `hydrate`'s fast path, runs on a disabled vault.
* **Hello cost:** a bank hello reads each box about three times: through the bank-wide `watchRows`, each vault's `listBoxes`, and each vault's own `watchRows`. It also reads whole documents rather than sparse ones. For 10 vaults × 100 boxes that's about 4 MB per load, sized against `notes/reference-sizes.md` on [#554](https://github.com/mrflip/safebyok/pull/554).

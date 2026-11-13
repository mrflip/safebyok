---
"safebyok": minor
"safebyok-react": minor
---

Each snapshot now shows its own state only, and no snapshot holds another's. The device's snapshot names its bank by `bank_tok` (null while it has none) in place of `bank`: read the bank's own snapshot with `device.bank?.getSnapshot()`. The bank's snapshot drops `maingate` and `vaults`: read `bank.maingate.getSnapshot()` for the gate, and `bank.vaultListing.getSnapshot()` for the vaults. A listing's snapshot (`bank.vaultListing`, `vault.boxListing`, and the gate and bank listings) is now the label of each present thing, a frozen array of strings that changes only when one comes or goes; subscribe to the thing itself for its own changes. In safebyok-react, `useBoxes` returns those boxlabels in place of each box's snapshot (use `useBox` and `useBoxSnapshot` for a box's own state), and `useBankSnapshot` no longer has `maingate` or `vaults`. A bank of another life replacing the bank listed now tells the device's listeners, whose `bank_tok` turns null. `subscribeOwn` is gone from banks, vaults, boxes and gates: `subscribe` is a thing's own changes only.

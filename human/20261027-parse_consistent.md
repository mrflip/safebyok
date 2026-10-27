# 2026-10-27: parse_consistent filed as #309, stacked on #295 -- one question on the box a write returns

[#309](https://github.com/mrflip/safebyok/pull/309) adds `consistent`, `demandConsistent`,
`verifyConsistent` and a validator's `parseConsistent`, and converts the bag-against-bag checks
to them. `Box.seal` now demands the stamp it is handed instead of taking the vault's. The vault
and bank now demand after each wait that lacked a demand. It also loosens STYLE.md's "no key".

**Open:** `#updateBoxListingOf` stamps the box a write returns with the picture's epochs after the
write. The test "a passkey added on this device while a box write is in flight lets the write
succeed, the box stamped with the new ways in" pins this. Nothing is written again, and the stored
record is the same either way, because a box's encryption context does not bind the gate. The
stamp only lets the returned Box open without a re-read. Should it be made under the seal's
stamp and demanded instead, so `putBox` refuses 'gate_moved' after the write landed (as
'vault_remade' already does)?

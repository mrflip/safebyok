---
---

No release: only safebyok, safebyok-react-lean and the dojo demo change, each private at 0.0.0, and safebyok-big gains an unused checker. What a host of the new core will see: `Device.make`'s record no longer takes `device_tok` (it refuses `bad_record`); an optional `devicetok` option takes its place, and without one the device keeps one in its deviceDB. A wayin records `devicetok`, so a gate stored before it reads as corrupt.

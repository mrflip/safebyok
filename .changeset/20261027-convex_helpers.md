---
"safebyok-convex": minor
---

safebyok-convex has a new peer dependency, convex-helpers (0.1.129 or later): add it to your app beside safebyok-convex (`pnpm add convex-helpers`). zod, already a peer of safebyok, is a peer of safebyok-convex too. The component's argument, return and table validators are now made from the core's Zod validators by convex-helpers' `zodToConvex`, so they follow the core's records. Convex now takes any value as a box's sidecar, where it took only an object: the client still refuses a sidecar that is no JSON object on every write, and reads one stored otherwise as a damaged box. The boxes table loosens likewise, which every stored box meets, so the deploy needs nothing of you. The component's function types now carry the core's brand on a passphrase's and a passkey's salt.

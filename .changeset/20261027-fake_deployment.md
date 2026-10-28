---
"safebyok-convex": minor
---

fakeDeployment (safebyok-convex/testing) gives its clients no logger by default, where a real Convex client prints each refused mutation on the console: a test that provokes a refusal no longer prints it. Pass fakeDeployment(host, { logger }) to hear the clients' lines, with log, warn and error functions (a VaultLogger fits), or logger: true for the console. FakeClientOpts, which connectWith hands its make function, gains a logger field: pass those options on to your client's constructor as they come, and it logs as the deployment was told.

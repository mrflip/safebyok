---
"safebyok-graphql": minor
---

GraphQLVaultDB implements safebyok's VaultDB, the interface once named VaultDBVerbs. vaultResolvers takes as its vaultDB an AdapterVaultDB, the base class once named VaultDB, which it now knows by its IsAdapterVaultDB brand, from whichever copy of safebyok; a GraphQLVaultDB, which is no AdapterVaultDB, is refused bad_option as before.

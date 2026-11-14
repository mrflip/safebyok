---
"safebyok-big": minor
"safebyok-graphql": minor
---

A bankDB's delBank answer carries `parent: 'main'` in place of null, and a watch notice for a bank row carries `'main'` as its parent, where it had none; `BankTop` is the constant (a bank has no row above it). A refusal that carried no row still has a null parent. In safebyok-graphql, `SafebyokDelBankAnswer` gains a nullable `parent: String`, and `BankOperations.delBank` selects it; a bank row's notice crosses with a null parent, which `GraphQLBankDB` reads as `main`. A `delBank` answer that crosses a wire without its `parent` is now refused as `unexpected_error`.

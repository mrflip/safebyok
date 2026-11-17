# 20261014-vocabulary: resolution

The vocabulary thread wrote VOCABULARY.md, naming the cast (whisper, lockbox, vault, passphrase, each key by role) and applying it across the project: [#4](https://github.com/mrflip/safebyok/pull/4). Gripes from its -human report (and its PR), as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

3 gripes: 1 unresolved, 2 resolved.

## Unresolved

- G178 **Decide:** stored-field underbar_case at the facades (`key_deriver_label`) or only at the adapter, and `keyDeriverLabel` vs STYLE's smush rule — old_gripes, humans_gripes

## Resolved

- G157 Give `user_id` a length cap and a replaceable validation → `UserId` 1..100 (Coach ruling, PR#87); `validators.userId` (PR#95)
- G158 `user_id` was once called `userlabel` and is not a Label → Label doc block and VOCABULARY fixed (old_gripes, Addressed)

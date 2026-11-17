# 20261014-rename_to_safebyok: resolution

The rename of the package to `safebyok`, since npm refused `byok` and `byokvault`: [#12](https://github.com/mrflip/safebyok/pull/12). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

3 gripes: 1 unresolved, 2 resolved.

## Unresolved

- G469 Rename the devcontainer `byok-*` volumes at the next container rebuild (renaming orphans the old ones) — old_gripes, humans_gripes, whiteboard_gripes

## Resolved

- G218 Put `safebyok-convex` in CI and give it its own configs, so its `justify` stops failing on an empty source → done (PR#16, PR#36)
- G473 Provide a reader for the stub's stored formats → none needed, nothing was published (PR#12)

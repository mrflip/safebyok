---
"safebyok-react": minor
---

**`PasskeyUnlockButton`'s `takesFocus` prop is now `isAutoFocused`.** It still focuses the button when it first renders. A host that passes `takesFocus` must rename it: TypeScript refuses the old name, and without TypeScript the old prop is ignored and the button is not focused.

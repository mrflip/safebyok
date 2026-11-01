---
"safebyok": minor
---

Models: a StoreFront fronts storage as the models' Store, and localStoreFront serves it from a StringStore. A put or del is versioned by revision_tok, and a stale one is refused with the stored row. The front computes revision_seq. A del over no row answers null. A row that reads as neither record nor tombstone is refused by name (damaged_box, damaged_vault) and is never delivered; rows a local store wrote in an older shape read this way. Store.watch takes a third callback, onChange, which is rung when the watch cannot say what changed, so the caller fetches again and meets any refusal itself. Scopepath gains withinBankScopepathPrefix and withinBankScopepathPred.

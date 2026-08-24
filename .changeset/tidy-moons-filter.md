---
'@flaghoist/server': patch
---

Stop a newly created flag disappearing behind the active dashboard filter.

Creating a live flag while the **paused** chip was selected saved it, added it to the list, and then
filtered it straight back out of view with no message. Nothing distinguished that from the save
having failed silently, and the natural next move is to create the flag again.

Creating a flag that the current filter or search would hide now clears them and says so. Editing an
existing flag leaves the filter alone, since that is a view you chose on purpose.

The filter predicate was also written twice, once for the list and once implicitly for the chips.
There is now one function feeding both, so they cannot drift apart.

The dashboard ships inside `@flaghoist/server`, which is why this releases there.

Creating a flag is also confirmed now. The list is alphabetical, so a new flag can land below the
fold and the closing dialog was the only sign anything had happened at all.

The message strip carried `role="alert"` for everything it said. An alert is for an urgent
interruption, so a confirmation announcing itself that way is wrong for anyone using a screen
reader. Errors keep `role="alert"`, confirmations use `role="status"`, and the two are now
distinguishable by colour as well.

The list is ordered newest first as well. It was alphabetical, so a new flag landed wherever its
name fell, often far below the fold in a list of any size. Ordering is on `createdAt` rather than
`updatedAt` so rows do not jump position every time a toggle is flipped, with the key breaking ties.

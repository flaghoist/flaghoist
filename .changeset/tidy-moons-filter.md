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

---
'@flaghoist/core': minor
'@flaghoist/server': minor
'@flaghoist/admin-client': minor
---

Add archiving and change descriptions.

- Archive a flag with `POST /api/v1/flags/:key/archive` and bring it back with `.../restore`. An
  archived flag keeps its definition but evaluates as disabled and is left out of
  `GET /api/v1/flags` unless `?includeArchived=true` is passed. `FeatureFlag` gains optional
  `archived` and `archivedAt` fields.
- A flag write can carry an optional `changeDescription`, recorded on its audit entry.
- The admin client adds `archive`, `restore`, an `includeArchived` list option and a
  `changeDescription` put option. The dashboard adds archive, restore and a reason field on edits.

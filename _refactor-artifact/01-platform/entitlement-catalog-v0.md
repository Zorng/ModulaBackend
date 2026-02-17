# v0 Entitlement Catalog (F3 Baseline)

Status: In use (F3)
Date: 2026-02-15

This artifact defines the baseline entitlement keys and how action keys map to entitlements.

## Baseline Entitlement Keys

Branch-scoped:
- `core.pos`
- `module.workforce`
- `module.inventory`
- `addon.workforce.gps_verification`

Branch-scoped capacity (future modeling):
- `capacity.operator_seats` (reserved; not represented by `enforcement` table yet)

## Default Seed (New Branch)

- `core.pos = ENABLED`
- `module.workforce = ENABLED`
- `module.inventory = ENABLED`
- `addon.workforce.gps_verification = DISABLED_VISIBLE`

## Current Action -> Entitlement Mapping

| Action Key | Entitlement Key |
|---|---|
| `attendance.checkIn` | `module.workforce` |
| `attendance.checkOut` | `module.workforce` |
| `attendance.listMine` | `module.workforce` |
| `menu.items.list` | `core.pos` |
| `menu.items.read` | `core.pos` |
| `menu.items.create` | `core.pos` |
| `menu.items.update` | `core.pos` |
| `menu.items.archive` | `core.pos` |
| `menu.items.restore` | `core.pos` |
| `menu.items.visibility.set` | `core.pos` |
| `menu.categories.list` | `core.pos` |
| `menu.categories.create` | `core.pos` |
| `menu.categories.update` | `core.pos` |
| `menu.categories.archive` | `core.pos` |
| `menu.modifierGroups.list` | `core.pos` |
| `menu.modifierGroups.create` | `core.pos` |
| `menu.modifierGroups.update` | `core.pos` |
| `menu.modifierGroups.archive` | `core.pos` |
| `menu.modifierOptions.create` | `core.pos` |
| `menu.modifierOptions.update` | `core.pos` |
| `menu.modifierOptions.archive` | `core.pos` |
| `menu.composition.upsert` | `core.pos` |
| `menu.composition.evaluate` | `core.pos` |

## Planned Expansion (Next POS Modules)

| Planned Action Key | Entitlement Key |
|---|---|
| `sale.create` | `core.pos` |
| `sale.finalize` | `core.pos` |
| `cashSession.open` | `core.pos` |
| `cashSession.close` | `core.pos` |
| `inventory.view` | `module.inventory` |
| `inventory.receive` | `module.inventory` |
| `inventory.adjust` | `module.inventory` |
| `workforce.shift.assign` | `module.workforce` |
| `attendance.gps.verify` | `addon.workforce.gps_verification` |

## Enforcement Semantics

- `ENABLED` => allow read/write (subject to role/context gates)
- `READ_ONLY` => allow read; deny write with `ENTITLEMENT_READ_ONLY`
- `DISABLED_VISIBLE` => deny action with `ENTITLEMENT_BLOCKED`

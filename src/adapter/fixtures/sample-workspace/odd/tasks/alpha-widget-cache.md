# alpha-widget-cache

Synthetic fixture for adapter-layer tests (T7, extended in T8, T9). Invented
content only — no real project data.

Branch: feat/alpha-widget-cache

## Objective

Cache widget lookups instead of recomputing them on every request.

## Problem

Cold lookups are measurably slow under load.

## Constraints

None recorded.

## Tasks

- [x] T1 Add an in-memory cache in front of the widget lookup
      DONE `1a2b3c4`

- [x] T2 Add a cache-hit metric
      DONE `5d6e7f8`

- [x] T3 Add a TTL eviction policy
      DONE `7a8b9c0`

## Next step

Watch cache hit-rate metrics in production for a week.

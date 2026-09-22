# beta-notification-hub

Synthetic fixture for adapter-layer tests (T8). Invented content only — no
real project data.

**Branch**: `feat/beta-notification-hub`

## Objective

Route every notification through one hub instead of each feature sending
its own.

## Problem

Notifications are currently fired from a dozen unrelated call sites with no
shared delivery, retry or dismissal behaviour.

## Constraints

None recorded.

## Tasks

- [x] B1 Add the notification hub's delivery queue
      DONE `2b3c4d5`

- [x] B2 Migrate the legacy alert call sites onto the hub

- [~] B3 Support a snooze action on a delivered notification
      Declined for this iteration: snooze needs its own storage and was
      cut from scope.

- [ ] B4 Add a user-facing dismiss action

## Acceptance criteria

- [ ] All notifications render through the hub, not a legacy call site.
- [x] Users can dismiss a notification once delivered.

## Next step

B4: wire up the dismiss action end to end.

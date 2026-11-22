# Regression Society — Upgrade Notes

## Identity
- Public-facing bot branding, embed footer, shop name, help copy, and project metadata now use **Regression Society**.
- Existing PostgreSQL database/user defaults remain `titanbot` to avoid silently switching existing installations to an empty database. You can rename the database separately after backing it up.

## Owner-only leveling security
- `/level setup` and `/level dashboard` are server-owner-only.
- `/leveladd`, `/levelremove`, and `/levelset` are server-owner-only.
- The check compares the invoking user ID to the Discord guild's actual `ownerId`; Administrator and Manage Server permissions are deliberately ignored.
- The interactive leveling dashboard is restricted to the user who opened it, and its entry point independently checks server ownership.
- Normal message-based XP earning, rank viewing, and leaderboards continue to work for members.

## Starboard
- Added `/starboard setup`, `/starboard status`, and `/starboard disable`.
- Setup accepts a destination text channel, star threshold, emoji, self-star policy, and bot-message policy.
- Reaction add/remove events update the featured post; messages are removed from the board when they fall below the threshold or the source message is deleted.
- Reaction event partials are enabled, and updates are serialized per source message to avoid losing rapid reaction changes.

## Validation
- All JavaScript files pass `node --check`.
- Relative source imports resolve.
- The server-owner authorization helper passed direct allow/deny tests.
- A live Discord/PostgreSQL integration test still requires the operator's bot token, server, and database; none are embedded in this archive.

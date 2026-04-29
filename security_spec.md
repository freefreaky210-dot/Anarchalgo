# Security Spec

Data Invariants:
1. Users can only read and write their own profile document `/users/{userId}`.
2. Users can only list and create documents in their own `/users/{userId}/trades/{tradeId}` subcollection. Trades cannot be modified or deleted.

The "Dirty Dozen" Payloads:
1. PII Blanket: Read `/users/{otherId}`. (Must Deny)
2. Spoofed Identity: Create `/users/{userId}` with a different user's UID. (Must Deny)
3. Update-Gap: Update `/users/{userId}` and add an unauthorized field `isAdmin: true`. (Must Deny)
4. State Shortcut: Update `usdBalance` to 1000000 without `affectedKeys().hasOnly()`. (Must Deny)
5. Size Attack: Create trade with a `reason` > 100 characters. (Must Deny)
6. ID Poisoning: Path var `userId` > 128 chars. (Must Deny)
... (etc)

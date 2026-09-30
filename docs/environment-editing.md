# Environment editing: bounded user-variable changes

Roadmap item **35 remains partially implemented**. This pass expands ordinary current-user variables from editing existing nonempty values to explicit **add, edit and delete**, including empty strings. System-variable editing, protected/security-sensitive variables and additional workflows listed below remain unavailable; “partial” is a product-scope statement, not simply a lack of Windows testing.

## Supported scope

- Manually read the 64-bit `HKCU\Environment` and `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` keys. The system key is always opened read-only; no process environment blocks are read.
- Add an absent ordinary current-user variable. Choose `String` (`REG_SZ`) or `ExpandString` (`REG_EXPAND_SZ`). If the user Environment key is absent, the explicitly confirmed add may create that one key with inherited/default permissions; it does not modify permissions.
- Edit an existing ordinary current-user variable while preserving its existing registry value kind. No rename or type conversion is performed.
- Delete an existing ordinary current-user variable after a separate target/old-value/type/consequence preview. The Environment key itself is never deleted.
- Save raw values, including whitespace, newlines, `%references%` and empty strings, without shell evaluation, expansion or trimming. An empty string is a stored value, not a delete request. Other programs may expand `REG_EXPAND_SZ` later.
- Mutable names contain 1–256 ASCII letters, digits or underscores and start with a letter or underscore. Existing other names can be viewed if valid but remain read-only. Values are valid Unicode with a maximum of 8192 UTF-16 code units and no NUL; no silent invalid-surrogate replacement is permitted.

The fixed native script independently rejects sensitive/protected names before reading the target value or opening a writable target. Sensitive-name matches (passwords, tokens, secrets, credentials, private/API/access keys, authentication and cookies) are represented by a placeholder without reading their contents. Protected names include PATH/PATHEXT, system/user/home/temp locations, common language/runtime injection hooks, proxy, certificate, Git/SSH and other security-relevant configuration. The frontend and native policy patterns are kept aligned by source tests. Name-based rules cannot recognize every sensitive value or every application's configuration; this is not a secret detector or a security-policy editor. Users should enter only ordinary application settings.

## Preview and confirmation lifecycle

1. Read a complete successful snapshot. Merely receiving zero output is not an empty valid list: a terminal `environmentSnapshot` marker is required, including for a true zero-row result.
2. Opt in to preview changes for this page. Choose add/edit/delete. Changing user data, kind, page, filter, edit mode, target, or refreshing invalidates the applicable preview/confirmation. Canceling a preview does not submit a write.
3. Generate a preview showing the exact user scope/name, registry kind, absence or old raw value, new raw value or deletion, and consequences. A same-name system variable triggers a warning about user-value shadowing and possible reappearance after deletion.
4. Check the explicit authorization checkbox and submit one change. Repeated clicks do not submit additional writes. The frontend revalidates the current full, unfiltered snapshot at submission; the native side is authoritative.
5. Whether the operation is verified, fails, is cancelled or times out, perform one read-only refresh while the page is still present. Never automatically retry a write. Success requires a completed zero-exit-code response with the matching action, name and scope, not a generic success flag. Leaving the page clears previews/draft values and prevents a late completion from starting a refresh.

The common native task reservation and `SYSTEM_CHANGE_LOCK` serialize this application's system-manager work. Name lookups are case-insensitive. Add requires absence and does not intentionally replace an existing value; edit/delete require presence and exact old raw value/kind. After the one write or deletion, flush the key, verify presence/absence and exact value/kind, and only then emit target-matched verification. A wrong-kind/missing/stale target is rejected rather than silently coerced.

**The comparison and mutation are not atomic with other applications.** The application mutex does not lock out external registry writers, and a competing writer can race after comparison or verification. There is no automatic overwrite-conflict recovery, rollback or rollback claim. Cancellation stops waiting/execution as supported by the existing task runner; it cannot undo an operation that already happened. An uncertain result requires a read-only inspection and a new intentional preview if another change is needed.

## Bounds, privacy and remaining scope

- Enumeration is capped at 500 inspected entries and native output at 64 KiB, with a 20-second native deadline. Unknown kinds, malformed/duplicate rows, invalid text, truncation, missing system key, nonzero exit, incomplete results and absent completion markers lock all changes.
- No elevation, system-key writes, permission/security changes, environment broadcast, process updates, command execution from values, automatic backups, export, clipboard, persistent value storage or telemetry is introduced.
- Changes normally affect applications launched in later login sessions; existing programs and the current Explorer environment may remain unchanged until sign-out/sign-in. Deleting a variable can break dependent applications or expose an inherited system value. The preview warns users to preserve old values securely themselves.
- Adding the first user variable can leave an empty Environment key if a subsequent operation fails; no cleanup delete is attempted.
- Still missing: system-variable editing; PATH/other protected or sensitive edits; non-ASCII and other unsupported-name edits; rename and existing-kind changes; integrated secure backup/restore; coordinated environment refresh. These limitations are separate from pending native validation.

## Verification

Run only the safe source/mock checks in a non-Windows development environment:

```text
node scripts/check-environment-editing.cjs
node scripts/check-system-managers.cjs
npx vue-tsc --noEmit
git diff --check
```

The environment script covers strict snapshot parsing, terminal markers, case-insensitive duplicates, protected/sensitive names, Unicode/value limits, absent/present preview preconditions, exact old values/types, empty-string-versus-delete behavior, target-matched verification, explicit confirmation, repeated clicks, stale previews, input/dismissal/refresh/unmount cleanup, and read-only reconciliation after failures/cancellation/timeouts. Native safety checks examine the actual Rust/PowerShell source and ensure the frontend/native name policies remain aligned. They do **not** execute PowerShell, Rust or any registry change, and are not a substitute for testing the native implementation. Pure Rust request-validation unit tests are included but require a suitable Rust/Windows toolchain to run.

Windows compilation, Windows PowerShell 5.1 parsing, registry read/write behavior, permissions, conflicts, real cancellation, browser/WebView interaction and visual checks remain unverified in this pass. Future Windows validation should use disposable ordinary test variables and a separately authorized test environment; never use production PATH, secrets, existing account/security configuration or automatic elevation as fixtures. No package dependency, installer or release is changed by this feature.

# Startup source inspection and controlled disable/restore (#34)

## Implemented scope

The startup page now has ten explicit source selections. It reads only the selected source and that source's dedicated backups; it does not present the result as a complete inventory of Windows persistence.

| Source | Inspection | Mutation after individual confirmation |
| --- | --- | --- |
| HKCU / HKLM `Software\Microsoft\Windows\CurrentVersion\Run`, Registry32 / Registry64 | Original `String` and `ExpandString` values and dedicated backups | Disable by backing up then removing the exact original; restore only when the original name is absent |
| HKCU / HKLM `...\RunOnce`, Registry32 / Registry64 | Original string values, no expansion | None; one-shot execution/deletion semantics are deliberately outside mutable scope |
| Current-user and all-users standard Startup folders, obtained with `Environment.GetFolderPath(..., DoNotVerify)` | Names, paths, file identity and metadata only | Move one confirmed ordinary file into a validated sibling backup directory; restore it by moving it back without replacement |

Registry views are requested explicitly. Windows may share some keys across views; two views are not necessarily independent copies. A 64-bit view on a 32-bit OS fails rather than silently returning the 32-bit view. HKLM/common Startup writes use existing process permissions only; permission failure does not request elevation or alter ACLs.

The word **registered** describes presence in Run or the Startup folder, not actual Windows enablement or execution. The application never runs commands, expands environment variables in Run values, resolves shortcut targets, loads startup files, or starts applications.

## Confirmation and bounded lifecycle

- Read-only by default. A per-page opt-in enables previews, then every individual change requires its own unchecked confirmation box
- The preview identifies the selected hive/view or folder, original/backup position, name, type, raw value/path, old/new registration state, and the effect on the next sign-in. All-users sources have an additional impact warning
- Each source is capped at 500 original/backup rows, 55 KiB row output with room for metadata, the runner's 64 KiB total output, and a 20-second deadline
- A source-specific terminal marker, successful process status, valid rows, and absence of any incomplete marker are all required before the page enables mutations. Unsupported or unreadable entries lock that source; they do not masquerade as an empty inventory
- Source changes, filtering, pagination, refresh, confirmation cancellation, and unmount invalidate pending confirmation. Duplicate clicks cannot issue a second mutation
- The native command consumes the job reservation before validating requests and shares the existing system-manager lock. Input is JSON on stdin; scripts are fixed crate-owned source
- Success receipts must match action, source, and name. Success, cancellation, timeout, or an uncertain result is followed only by a read-only refresh while the page remains mounted. There is no automatic retry, rollback, or reverse mutation
- Listings/commands remain in page memory. Deliberately created recovery data persists on disk/in the registry and is not encrypted

## Registry backup and conflicts

The original HKCU Run64 backup remains at `HKCU\Software\LocalToolbox\StartupBackup` for compatibility. Other Run sources use `Software\LocalToolbox\StartupBackupV2\<source-id>` in the **same hive and registry view** as the source. RunOnce does not create or inspect backups.

Disable checks the current original kind/raw value against the confirmed snapshot, refuses a conflicting backup, writes a backup only if one is absent, flushes and verifies it, rechecks the original, removes the original value, and verifies both absence and retained backup. An identical existing backup is reused without rewriting it. Restoration requires an existing Run key, a matching backup, and an absent target value; the original kind and raw bytes represented by the string are preserved, and the backup is retained. No arbitrary add/edit operation exists.

Registry APIs do not offer an atomic create-only value or compare-and-delete primitive here. Checks and writes therefore have an unavoidable race against unrelated processes. A concurrent process can change/recreate a value in that window. The UI explicitly discloses this limitation; verification failure reports an uncertain result and does not overwrite a conflicting state in a retry. This implementation must not be described as an atomic transaction or guaranteed non-overwrite against concurrent external writers.

## Startup-folder backup and restoration

The fixed backup name is `.LocalToolbox-StartupBackup`, a **sibling of**, not a child inside, the selected Startup folder. An origin marker `.local-toolbox-origin-v1` identifies the source, resolved folder path, parent file identity and original Startup-directory identity. The marker is created with `FILE_CREATE`, flushed and reread. An existing backup directory must have that exact marker; an unrelated, tampered, relocated, or recreated origin is rejected. Failure while first creating the directory/marker can leave an unusable empty or partial backup directory; it is never silently adopted or automatically removed.

The native helper:

1. Requires a fixed local drive and bounded absolute path; opens and retains each ancestor from the drive root
2. Uses handle-relative `NtCreateFile`, exact component names, `OBJ_DONT_REPARSE`, `FILE_OPEN_REPARSE_POINT` and no-recall options; rejects reparse/offline/cloud-placeholder entries and hard-linked files
3. Holds handles denying write/delete sharing and rejects type changes, unsupported names, directories where a file is expected, and inaccessible metadata. The app's marker is the only file whose content is read/written; startup file contents and targets remain opaque
4. Computes the preview token over the source/path, parent and directory identities, file identity, size, attributes, modification time and change time. Reopening before a change must reproduce the token
5. Opens the original file with delete access and moves that same file using `NtSetInformationFile(FileRenameInformation)` with `ReplaceIfExists = false` and a held target directory handle. Existing files, directories, links or conflicting names fail instead of being replaced. It neither copies bytes nor deletes a separate copy
6. Verifies the moved handle's identity, size, attributes, modification time and final path, and verifies the old name is absent before issuing a success receipt

Moves preserve the original file's content, streams, identity and ACL rather than inheriting a newly copied file's permissions. A reverse move consumes the backup location: after successful folder restoration there is **no extra retained backup copy**. The origin marker/directory remain. A later disable can reuse them after validation. Existing source and backup names are surfaced as conflicts, not merged or overwritten.

This is a bounded live view, not an OS snapshot. External processes can act after verification; privileged/kernel actors and filesystem behavior are not made transactional by the app lock. Cancellation may arrive immediately after a rename. Re-read both locations before taking any further action; do not infer that cancellation undid a move.

## Remaining product gaps

#34 implements the original inspect/manage workflow in the listed sources. The following sources/operations remain explicitly excluded; Windows acceptance is a separate outstanding gate (see [scope and verification](scope-and-verification.md)):

- Scheduled-task inventory/management is not implemented. Safely handling trigger types, principals, running instances, protected tasks and enablement semantics needs its own preview and recovery design
- `StartupApproved` state is not modified or used to claim actual enablement; restoring a registration can leave it disabled by Windows or policy
- RunOnce is read-only; policy Run keys, other users' hives, services, drivers, shell extensions, Winlogon and other persistence mechanisms are not covered
- Redirected/UNC/reparse Startup paths, directories, hard links, inaccessible entries and unsupported names are excluded; known `desktop.ini` shell metadata is ignored
- Run-key recreation, arbitrary entry creation/editing, conflict replacement and automatic backup cleanup are excluded

## Verification status

Executed in the non-Windows development workspace:

- `node scripts/check-startup-sources.cjs`: parser bounds/source/state combinations, receipt correlation, confirmation/repeated-click/source-change/unmount lifecycle mocks, an explicitly abstract rename/conflict model, and native-source invariants
- `node scripts/check-system-managers.cjs` and `node scripts/check-system-safety.cjs`: existing system-manager regressions
- `vue-tsc --noEmit` and `git diff --check`

No registry/startup mutations or real startup inventory reads were performed. Windows PowerShell/C# compilation, Rust/FFI compilation, actual known-folder lookup, directory-handle/rename behavior, permissions, and desktop UI are **not executed or validated** here. The abstract model and source assertions do not establish native runtime correctness. Each compacted fixed script has a checked budget below the Windows 32,767-character command-line limit.

Before release, use an isolated Windows test VM and a synthetic-root test harness to exercise create-only marker creation, incorrect/missing marker rejection, disable/restore, destination conflicts, stale identities, shortcut opacity, hard links/reparse/redirected paths, access denial, partial enumeration, and cancellation immediately before/after a move. Registry tests must use isolated synthetic hives/keys through a test harness, never the real Run/RunOnce locations. Native test tooling must not run the production entrypoint against real startup sources as a smoke test.

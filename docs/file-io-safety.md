# File tools safety boundary

The file-search/tree scanner uses C# handle-relative reads. The list exporter and
split/merge tool use `safe_file_io.rs`, which implements the same Windows NT
handle-relative traversal rules for explicit inputs and outputs:

- Local drive subdirectories only; reject UNC/device paths, reserved components,
  ADS, dot segments, excessive depth and reparse/offline entries
- Open the drive without following reparse points; verify its final drive path
- Retain all ancestor directory handles without write/delete sharing
- Resolve each exact-case component via `NtCreateFile` with `OBJ_DONT_REPARSE`,
  `FILE_OPEN_REPARSE_POINT`, and `FILE_OPEN_NO_RECALL`; check opened attributes
- Existing data handles are read-only, existing-only and share-read-only
- Output handles use exclusive `FILE_CREATE`. Conflicting names, including
  pre-existing links, fail rather than truncate. No input is overwritten
- Before writing any bytes, mark each new file delete-pending by handle. Drop
  closes the handle and removes uncommitted output. No path-based cleanup
- Flush completed data before clearing deletion disposition. Do **not** open
  with `FILE_DELETE_ON_CLOSE`: that flag would prevent clearing the disposition
- Export is limited to 1 MiB and a manually chosen new CSV/TXT file

These are bounded live operations, not filesystem snapshots. Kernel/privileged
changes and pre-existing memory-mapped writers are outside the guarantee.
Windows or device failure can prevent cleanup; a process crash between initial
create and deletion marking can leave an empty output. Multi-file publication is
not a filesystem transaction. Do not describe it as crash-atomic.

API references:
- https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info

Validation in this Linux workspace: TypeScript/pure synthetic logic, mocked
lifecycle, and source guardrails only. Windows Rust/FFI compilation, filesystem
behavior and desktop UI have **not** been run. The existing native scanner test
uses its own disposable fixtures only; it is an opt-in Windows check.

## Binary split/merge

- 512 MiB total, 1–64 MiB per part, at most 512 parts, 256 KiB manifest
- Fixed 256 KiB copy buffer. SHA-256 uses the already locked `sha2 0.10.9`
  package, now listed directly in Cargo.toml (no additional package is resolved)
- Split reserves all create-only output names before streaming, hashes each part
  and whole input, and rereads generated parts before publishing the manifest
- Merge accepts version 1 only. Array indexes, generated basenames, count, exact
  sizes, per-part SHA-256 and total SHA-256 must match. Names cannot contain paths
- Input identities, size, modified time and change time are rechecked. Source and
  manifest remain read-only; part reads resolve against the retained manifest
  directory. A checksum provides integrity, not proof of a trusted sender
- Cancellation and a 120-second cooperative deadline are checked during IO and
  pre-commit flushing. A pending synchronous Windows IO may delay those checks
- All outputs remain delete-pending until validation and flushing finish. The
  short final retention phase deliberately cannot be cancelled. If retention
  fails, unaccepted handles are re-marked for deletion on Drop; OS/disk failure
  can still prevent cleanup, and is reported as a reason to inspect outputs
- This is not multi-file crash-atomic publication: a crash during final retention
  may leave complete parts or a manifest. Existing originals are never cleaned up

Additional opt-in Windows tests (not run in this workspace):
`cargo test file_parts -- --test-threads=1` covers synthetic binary round-trip,
empty files, corruption, missing parts, conflicting outputs, cleanup and cancelled
jobs; stream tests include interruption after one block and short reads.
`cargo test safe_file_io -- --test-threads=1` covers create-only/pending/retain IO.

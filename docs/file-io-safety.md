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

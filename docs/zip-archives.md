# ZIP files and directory trees

The ZIP tool creates archives from explicitly selected files or one selected
local directory, browses their central directory, extracts a selected file, and
restores a complete archive into an explicitly authorized **new** directory.
The directory input includes its root basename, nested directories and empty
directories. An empty archive can restore to an empty new output directory.
No files are executed. There are no package/lockfile changes in this gap pass.

## Input and expansion budgets

- ZIP input: 32 MiB, 200 central-directory entries
- Creation: 16 MiB combined ordinary-file bytes, 200 nodes including the selected
  root, implicit parents and empty directories; at most 16 archive path levels
- Extraction: 16 MiB per file, 64 MiB combined actual and declared bytes, at most
  200 output nodes **including implicit parents**; expansion ratio at most 200:1
- Names: 512 UTF-16 units per relative archive path, 120 per component
- The Worker is terminated after 15 seconds, on cancellation or navigation
- Native directory IO has a 60-second cooperative deadline and checks
  cancellation between entries and 256 KiB IO blocks. A pending synchronous
  Windows IO can delay cancellation. Payload validation is bounded by the above
  entry/byte limits and is checked before any destination creation
- Base64 transport and JS/Rust buffers mean peak memory is a bounded multiple of
  the data budgets, not a claim that process memory stays below 64 MiB

Only stored and raw Deflate content with ASCII/UTF-8 names is supported. The
parser rejects encrypted, multipart and ZIP64 archives, unsafe/reserved paths,
links/devices/reparse attributes, duplicate names, NFC/case aliases (including
implicit parent aliases), file/directory conflicts, overlapping records,
self-extracting prefixes, unexpected container gaps and unsupported name/link
extensions. Central and local headers must agree. Explicit directory records
must be empty stored entries with zero CRC. Unsupported forms fail closed.

Structure inspection alone does not certify file data. Every extracted file
must match its exact expanded size and CRC32 before its output is offered.
Raw Deflate extraction uses the already installed pako streaming decoder with
16 KiB output chunks, a real stream-end requirement, and exact consumed-input
checks. Truncated streams, concatenated streams and hidden trailing compressed
bytes fail, even when expanded bytes and CRC would otherwise match. Creation
continues to use fflate 0.8.3; content exceeding the ratio budget is stored.

## Explicit authorization and safe Windows IO

The user first validates the whole ZIP. The UI then displays the exact selected
parent directory, new child-directory name, entry count and bytes. A separate
confirmation is required before native restoration. Changing the destination,
name, archive or selection clears that confirmation. Duplicate submissions and
late dialog/Worker/native results cannot start a second or stale operation.
Success requires a completed/zero-exit native receipt matching the requested
output path, entry count and byte count.

`zip_directories.rs` uses the retained Windows handles in `safe_file_io.rs`:

- Local drive subdirectories only; no drive roots, UNC/device paths or ADS
- Handle-relative, exact-component reads and creates via `NtCreateFile`;
  `OBJ_DONT_REPARSE`, `FILE_OPEN_REPARSE_POINT` and `FILE_OPEN_NO_RECALL`
- Directory enumeration via `NtQueryDirectoryFile` on the retained handle,
  bounded/aligned buffers and validated UTF-16 entry records
- Source files are existing-only, read-only and share-read-only. Opened file
  identity, size and change/modified stamps are checked around reads. More than
  one hardlink is rejected; directory stamps are checked around traversal
- The destination root and every child directory/file use exclusive
  `FILE_CREATE`. Existing directories are never reused and files are never
  overwritten. Filesystem-specific alias collisions also fail at creation
- All output names are reserved before any content is written. Decoded bytes
  and CRC are validated independently in Rust before destination creation;
  files are flushed and reread with CRC/size checks before retention
- New files stay delete-pending until validation/flush finishes. Directory
  handles cannot stay delete-pending while populating their children, so they
  are tracked separately. On failure/cancellation, files close first, followed
  by deletion marking and closure of new directories deepest-first
- Cleanup only uses owned, retained handles. It does not traverse or delete a
  destination path, remove a pre-existing object, or run a shell command

Directory restoration is **not crash-atomic**. The final file-retention phase
is deliberately short and non-cancellable. A crash, OS/filesystem failure or a
foreign entry can leave empty directories or a partial tree of new files.
Cleanup errors identify the selected new output path for inspection. Source
reads are bounded live reads, not filesystem snapshots; pre-existing mapped
writers or privileged/kernel changes remain outside the guarantee.

Timestamps, ACLs/permissions, ownership, streams and other filesystem metadata
are not preserved. Only unnamed ordinary-file bytes and directory structure
are included. Single-entry save-as retains the existing binary-export behavior:
after save starts it cannot be withdrawn; prior saved outputs remain.

## Verification

Source and synthetic checks in this Linux workspace:

- `node scripts/check-zip-directories.cjs`: round trips, empty/implicit/root
  directories, Unicode paths, alias/conflict rejection, node/byte/ratio budgets,
  CRC damage, malformed/truncated/trailing Deflate and native source guardrails
- `node scripts/check-zip-directory-ui.cjs`: explicit destination confirmation,
  edits invalidating approval, duplicate submissions, cancellation during read,
  navigation/unmount, stale dialogs and mismatched/failed completion receipts
- Existing file-parts/file-tool/scanner safety checks and `vue-tsc --noEmit`

Opt-in Windows synthetic test source is included in
`src-tauri/src/zip_directories_tests.rs`:
`cargo test zip_directories -- --test-threads=1`. It covers nested/empty-tree
round-trip, binary/empty files, existing-target conflicts, hardlinks, reverse
rollback and cancellation before creation. It uses newly created temporary
fixtures only. Additional release-gate cases should inject cancellation during
IO, post-create/retention/cleanup failures, junction/symlink races and directory
mutation. Windows Rust/FFI compilation, these native tests, actual filesystem
behavior and desktop UI have **not** been executed here. No installation,
package audit, elevation or real user-file operations were performed.

API references:
- https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntquerydirectoryfile
- https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_directory_information
- https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntcreatefile
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle

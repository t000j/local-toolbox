# Image tool boundaries and validation

## New tools: resize, crop / rotate / flip, metadata

- Only signature-validated static PNG and 8-bit sequential/progressive JPEG are edited; APNG is recognized but rejected by the editor. Metadata viewing can report APNG headers. GIF, WebP, BMP, TIFF, SVG, HEIF and AVIF are not inputs to these new tools.
- Maximum 16 MiB per input/output, 32 MiB per batch input/output, eight files, 8192 pixels per edge and 16,000,000 pixels per image. Batch editing is sequential and all-or-nothing in memory; manual saves remain independent.
- Header validation runs before pixel decoding. EXIF orientation is applied by `createImageBitmap` with `imageOrientation: 'from-image'`; decoded dimensions must match the oriented header dimensions. Orientations 5–8 swap width and height. Actual WebView orientation rendering still needs runtime acceptance testing.
- Resize preserves aspect ratio by fitting into a width/height box unless explicitly disabled; percentage mode uses each image's own oriented dimensions. Results are rounded to the nearest integer and bounded below by one pixel.
- Crop uses oriented source coordinates, then clockwise quarter-turn rotation, then flips about the output image's horizontal/vertical axes. The complete integer crop rectangle must fit in the source.
- Canvas results are PNG. Canvas color conversion, alpha handling and encoder behavior depend on WebView; color profile/HDR/high-bit-depth preservation is not promised. Original EXIF, GPS, text and other source metadata are not copied. This workflow is not an audited privacy scrubber.
- Workers have bounded input and pixel counts and a 30-second editor/10-second metadata deadline, with termination on edits, cancel or navigation. Bitmap handles are closed and canvas backing sizes reset. These limits bound app-requested work, not an absolute process-memory ceiling; browser codecs and preview decoding own their allocations.
- Only the currently selected output has a preview object URL, which is revoked on changes and unmount. No image data is persisted or uploaded. Saving uses the existing Windows create-only binary-output path; no overwriting existing files. After save submission, navigation does not reverse it.
- Metadata is an explicitly limited header/EXIF view. PNG chunk CRC/bounds and JPEG marker/scan structure are checked; pixel entropy is not validated by the header reader. Camera, time, exposure, aperture, ISO, focal length and GPS are a supported subset; MakerNote, full linked IFDs, XMP, IPTC and compressed ICC/PNG text are not interpreted. Control characters and markup-looking metadata are escaped and Vue only renders text. Missing fields are not evidence of absent metadata or authenticity.

## Existing tools 51 / 53 audit

The existing conversion/compression tools already use Rust `image`, apply EXIF orientation, flatten JPEG transparency onto white, disclose animation-to-still conversion/metadata loss and use `create_new(true)` to refuse existing final filenames. They were not duplicated.

Their older path is different from the new editor: input limits are 100 MiB / 40,000,000 pixels, the file-size check precedes opening the decoder, output ancestors are not protected by the new handle-relative save implementation, and old Vue pages do not have the new Worker cancellation/revision lifecycle. They must not be described as having the new editor's stricter protections. Future hardening should take a bounded input snapshot, configure decoder allocation limits, reuse protected output handles and guard stale/repeated native operations. Rust compilation and Windows filesystem behavior have not been tested in this environment.

## Validation scope

Run `node scripts/check-image-{headers,geometry,worker,lifecycle}.cjs` individually, followed by `npx vue-tsc --noEmit`, `npm run build`, `npm run release:check` and `git diff --check`. Tests use synthetic bytes and mocks only; they do not read user pictures or invoke a native save. Parser fixtures include generated encoder samples when documented in the check script.

Cloud Chromium inventory exists, but opening the local test app using the supported CUA browser route returned `net::ERR_BLOCKED_BY_CLIENT`; no alternate access/security bypass was attempted. Thus actual Canvas pixels, WebView codec behavior, visual UI and Windows save dialogs remain unverified. Windows Rust/FFI compilation also remains unverified. This source batch does not change the shipped 0.1.2 release (41 tools).

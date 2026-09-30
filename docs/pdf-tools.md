# PDF processing: current partial scope

Tool 61 merges 2–8 local files in the visible list order and keeps each source's page order. It uses pinned `pdf-lib` 1.17.1 (MIT), loaded only in a Worker. Input is ≤8 MiB/file and ≤16 MiB total; output ≤16 MiB and ≤200 pages. The UI uses a 30-second Worker deadline with cancel, edit/clear and navigation termination. Saving uses the existing Windows create-only binary output, with no automatic overwrite/open/upload.

## Supported subset and rejections

This is deliberately **partial**. Only canonical PDF 1.0–1.7 with classic cross-reference tables, direct stream lengths and supported static pages is admitted. Ordinary PDFs with object streams, xref streams, incremental updates, encrypted content, forms/signatures, annotations/links, actions/JavaScript, embedded/external files, navigation/bookmarks, optional layers, tagging or document-level OutputIntents are rejected. No password bypass or silent flattening is attempted. Conservative checks can reject valid documents, including names whose spelling creates parser ambiguity.

Before library parsing, the code validates PDF syntax, lengths, object definitions/references, xref offsets and EOF. It scans decoded names, including `#XX` spelling, even inside byte payloads, to reject object/xref-stream parsing paths before the library can decompress them. Strict bounds include 6,000 objects, 100,000 syntax/graph nodes, depth32, strings64KiB and page-tree depth24. The raw scanner can intentionally produce false positives.

After loading, object identities must match preflight, no library recovery is accepted, the page tree must be acyclic with correct Parent/Count, and supported objects are audited. Resource fingerprinting is cycle/depth/size bounded; it compares original stream bytes and canonical resource dictionaries rather than decoding them. MediaBox/CropBox/BleedBox/TrimBox/ArtBox, rotations and positive UserUnit (≤75,000) are validated. After save, a fresh preflight/load/audit checks page count and every page's SHA-256 content/resource/property fingerprint in order.

Page content/resources are preserved, not malware-sanitized. A malicious compressed image/font/content stream may remain dangerous to a later PDF reader even though this app does not render or decompress it. Use trusted inputs. Document metadata/identity and viewer preferences are not retained; visible content and page metadata can still contain private information. This is neither anonymity processing, compression nor PDF/A conversion. Bounds reduce work but are not an absolute process-memory guarantee.

## Evidence and remaining gaps

- `scripts/check-pdf-merge.cjs`: synthetic classic-xref inputs, encoded/indirect stream-type rejection before library load, damaged references/xref, cycles, excessive limits, unsupported features, page order, geometry, contents/resources and output reparse
- `scripts/check-derived-ui.cjs`: simulated file reordering, acknowledgment, stale results, duplicate saves and navigation
- Independent Poppler verified a three-page synthetic merge: ALPHA1, ALPHA2, BRAVO1, with differing page geometry and 90° rotation; all three source/output raster PNGs were byte-identical
- No real user PDFs were read. Windows dialogs/create-only IO, WebView UI and clipboard remain unverified; cloud local-browser access was blocked and not bypassed

Compatibility with object streams, forms/annotations, richer document structures and broader PDF variants remains open, so the roadmap marks this tool partial. Library reference: [PDFDocument API](https://pdf-lib.js.org/docs/api/classes/pdfdocument) and [load options](https://pdf-lib.js.org/docs/api/interfaces/loadoptions).

## Page extraction (62, partial)

Read and audit one ≤8 MiB source, then select comma-separated page numbers or ascending ranges, e.g. `1-3,5`. Selection order is output order; overlap, duplicate pages, descending ranges, empty tokens and out-of-range pages are errors. Export one new PDF per selection; repeat for additional parts. Page count/geometry is shown, not content thumbnails. Source bytes remain unchanged. Output is reloaded and fingerprints must match every selected source page, including its original rotation. The same format/feature limitations above apply. Synthetic Poppler output for source pages 4 and 2 matched each source raster byte-for-byte. Mock editor tests cover edits, cancellation state, duplicate saves and stale save completion; actual UI/native saving remains untested.

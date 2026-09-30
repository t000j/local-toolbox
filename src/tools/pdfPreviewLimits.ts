// Shared admission and renderer limits; no image may be silently skipped by PDF.js.
export const PDF_PREVIEW_IMAGE_EDGE = 4096
export const PDF_PREVIEW_IMAGE_PIXELS = 12_000_000
export const PDF_PREVIEW_TOTAL_IMAGE_PIXELS = 16_000_000
export const PDF_PREVIEW_DECODED_BYTES = 32 * 1024 * 1024
export const PDF_PREVIEW_FONT_BYTES = 4 * 1024 * 1024
export const PDF_PREVIEW_IMAGE_RGBA_BYTES = 64 * 1024 * 1024

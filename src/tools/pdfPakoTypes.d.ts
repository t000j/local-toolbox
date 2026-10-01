// Pako 1.0.11 is already locked as pdf-lib's dependency. Only the inspected streaming surface is used.
declare module 'pako' {
  export class Inflate {
    constructor(options: { chunkSize: number; windowBits: number })
    onData: (chunk: Uint8Array) => void
    onEnd: (status: number) => void
    push(data: Uint8Array, mode: boolean): boolean
    ended: boolean
    err: number
    strm: { avail_in: number; next_in: number; total_in: number }
  }
}

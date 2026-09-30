export const jsonPathLimits = { inputBytes: 1024 * 1024, expressionLength: 2000, matches: 500, resultBytes: 2 * 1024 * 1024, nodes: 50000, depth: 128, timeoutMs: 3000 }
export interface JsonPathRequest { input: string; expression: string }
export interface JsonPathMatch { path: string; valueText: string; valueType: string }
export interface JsonPathResult { matches: JsonPathMatch[]; valuesJson: string; truncated: boolean; limitReason: 'count' | 'size' | null; elapsedMs: number }
export type JsonPathResponse = { ok: true; result: JsonPathResult } | { ok: false; error: string }

/* tslint:disable */
/* eslint-disable */

export class GeneaQuiltEngine {
    free(): void;
    [Symbol.dispose](): void;
    bring_and_slide_json(external_id: string, direction: string): string;
    doi_json(external_id: string, mode: string): string;
    highlight_summary_json(external_ids_json: string, mode: string): string;
    interaction_json(external_id: string, mode: string): string;
    constructor(source: string);
    scene_json(): string;
    search_json(query: string, scope: string): string;
    summary_json(): string;
    timeline_focus_json(start_year: number, end_year: number, scope: string): string;
    timeline_json(external_ids_json: string, selected_id: string | null | undefined, scope: string): string;
    trace_json(external_id: string, mode: string): string;
    vertex_details_json(external_id: string): string;
    static with_ranker(source: string, ranker: string): GeneaQuiltEngine;
}

export function engine_status_json(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly engine_status_json: () => [number, number];
    readonly __wbg_geneaquiltengine_free: (a: number, b: number) => void;
    readonly geneaquiltengine_new: (a: number, b: number) => [number, number, number];
    readonly geneaquiltengine_with_ranker: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly geneaquiltengine_summary_json: (a: number) => [number, number];
    readonly geneaquiltengine_scene_json: (a: number) => [number, number];
    readonly geneaquiltengine_doi_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_search_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_vertex_details_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly geneaquiltengine_bring_and_slide_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_highlight_summary_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_timeline_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly geneaquiltengine_timeline_focus_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_trace_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly geneaquiltengine_interaction_json: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

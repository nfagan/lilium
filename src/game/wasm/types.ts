export type WasmModuleLoadOptions = {
  locateFile: (path: string, prefix: string) => string,
  wasmMemory?: WebAssembly.Memory
}
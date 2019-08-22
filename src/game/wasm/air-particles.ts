//  @ts-ignore
import * as ModuleLoader from '../../../../dist/res/wasm/air-particles.js';

export type AirParticlesModule = WebAssembly.Module & {
  _update: (translationsPtr: number, offsetPtr: number, rotPtr: number, alphaPtr: number, alphaSignPtr: number, numParticles: number, noisePtr: number, 
    noiseIndicesPtr: number, numNoiseSamples: number, normX: number, normZ: number, dtFactor: number, playerPositionPtr: number) => void,
  _lilium_new_float_array: (size: number) => number,
  _lilium_new_int32_array: (size: number) => number,
  _lilium_free_float_array: (ptr: number) => void,
  _lilium_free_int32_array: (ptr: number) => void,
  wasmMemory: WebAssembly.Memory
}

const MAX_NUM_MEMORY_PAGES = 128;

export function makeMemory(): WebAssembly.Memory {
  return new WebAssembly.Memory({
    initial: MAX_NUM_MEMORY_PAGES,
    maximum: MAX_NUM_MEMORY_PAGES
  });
}

export async function loadModule(memory: WebAssembly.Memory): Promise<AirParticlesModule> {
  return new Promise((resolve, reject) => {
    const options = {
      wasmMemory: memory
    }

    ModuleLoader(options).then((mod: any) => {
      resolve({
        _update: mod._update,
        _lilium_new_float_array: mod._lilium_new_float_array,
        _lilium_new_int32_array: mod._lilium_new_int32_array,
        _lilium_free_float_array: mod._lilium_free_float_array,
        _lilium_free_int32_array: mod._lilium_free_int32_array,
        wasmMemory: mod.wasmMemory
      });
    });
  });
}
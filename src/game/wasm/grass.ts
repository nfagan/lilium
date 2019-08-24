//  @ts-ignore
import * as ModuleLoader from '../../../../dist/res/wasm/fast-grass.js';
import { defaultLocateFileFunction } from './util';
import * as types from './types';

export type GrassModule = WebAssembly.Module & {
  _fast_grass_update_wind: (wt: number, vt: number, noise: number, indices: number, numPixels: number, numSamples: number, windVx: number, windVz: number, decayAmt: number) => void,
  _fast_grass_update_velocity_displacement: (vt: number, texture_size: number, player_x: number, player_y: number, player_z: number, player_width: number, player_depth: number, scale_x: number, scale_z: number, max_dim: number, blade_height: number) => void,
  _fast_grass_new_float_array: (size: number) => number,
  _fast_grass_new_uint8_array: (size: number) => number,
  _fast_grass_new_int32_array: (size: number) => number,
  _fast_grass_free_float_array: (ptr: number) => void,
  _fast_grass_free_uint8_array: (ptr: number) => void,
  _fast_grass_free_int32_array: (ptr: number) => void,
  wasmMemory: WebAssembly.Memory
}

const MAX_NUM_MEMORY_PAGES = 128;

export function makeMemory(): WebAssembly.Memory {
  return new WebAssembly.Memory({
    initial: MAX_NUM_MEMORY_PAGES,
    maximum: MAX_NUM_MEMORY_PAGES
  });
}

export async function loadModule(memory: WebAssembly.Memory): Promise<GrassModule> {
  return new Promise((resolve, reject) => {
    const options: types.WasmModuleLoadOptions = {
      wasmMemory: memory,
      locateFile: defaultLocateFileFunction
    };

    ModuleLoader(options).then((mod: any) => {
      resolve({
        _fast_grass_update_wind: mod._fast_grass_update_wind,
        _fast_grass_update_velocity_displacement: mod._fast_grass_update_velocity_displacement,
        _fast_grass_new_float_array: mod._fast_grass_new_float_array,
        _fast_grass_new_uint8_array: mod._fast_grass_new_uint8_array,
        _fast_grass_free_float_array: mod._fast_grass_free_float_array,
        _fast_grass_new_int32_array: mod._fast_grass_new_int32_array,
        _fast_grass_free_int32_array: mod._fast_grass_free_int32_array,
        _fast_grass_free_uint8_array: mod._fast_grass_free_uint8_array,
        wasmMemory: mod.wasmMemory
      });
    });
  });
}
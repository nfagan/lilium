import * as ModuleLoader from '../../dist/res/wasm/fast-grass.js';
import { smootherStep, smoothStep } from '../src/audio/util';

type MyModule = WebAssembly.Module & {
  _fast_grass_update: (wt: number, vt: number, noise: number, indices: number, numPixels: number, numSamples: number, windVx: number, windVz: number, decayAmt: number) => void,
  _fast_grass_new_float_array: (size: number) => number,
  _fast_grass_new_uint8_array: (size: number) => number,
  _fast_grass_new_int32_array: (size: number) => number,
  _fast_grass_free_float_array: (ptr: number) => void,
  _fast_grass_set_value: (ptr: number, value: number, idx: number) => void,
  _malloc: (a: number) => number,
  wasmMemory: WebAssembly.Memory
}

async function loadModule(memory: WebAssembly.Memory): Promise<MyModule> {
  return new Promise((resolve, reject) => {
    const options = {
      wasmMemory: memory
    }

    ModuleLoader(options).then((mod: any) => {
      console.log(mod);

      resolve({
        _fast_grass_update: mod._fast_grass_update,
        _fast_grass_new_float_array: mod._fast_grass_new_float_array,
        _fast_grass_new_uint8_array: mod._fast_grass_new_uint8_array,
        _fast_grass_free_float_array: mod._fast_grass_free_float_array,
        _fast_grass_set_value: mod._fast_grass_set_value,
        _fast_grass_new_int32_array: mod._fast_grass_new_int32_array,
        _malloc: mod._malloc,
        wasmMemory: mod.wasmMemory
      });
    });
  });
}

function makeFloat32Array(memory: WebAssembly.Memory, ptr: number, size: number): Float32Array {
  return new Float32Array(memory.buffer, ptr, size);
}

function makeInt32Array(memory: WebAssembly.Memory, ptr: number, size: number): Int32Array {
  return new Int32Array(memory.buffer, ptr, size);
}

function makeUint8Array(memory: WebAssembly.Memory, ptr: number, size: number): Uint8Array {
  return new Uint8Array(memory.buffer, ptr, size);
}

function makeCanvas(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.style.width = '100%';
  el.style.height = '100%';
  document.body.appendChild(el);
  el.width = el.getBoundingClientRect().width * (window.devicePixelRatio || 1);
  el.height = el.getBoundingClientRect().height * (window.devicePixelRatio || 1);
  return el;
}

function drawToCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 10;

  let t = (Math.sin(performance.now()/500) * 0.5 + 0.5);
  t = smootherStep(t);

  ctx.beginPath();
  ctx.arc(canvas.width * t, 80, 70, 0, Math.PI * 2);
  ctx.stroke();
}

function checkSize(maxNumMemoryPages: number, numPixels: number, numNoiseSamples: number): boolean {
  const maxBytes = maxNumMemoryPages * 64 * 1024;

  const windTextureBytes = numPixels * 4; //  4 components per pixel
  const velocityTextureBytes = numPixels * 4; //  4 components per pixel
  const noiseBytes = numNoiseSamples * 4; //  1 component, 4 bytes each
  const indicesBytes = numPixels * 4; //  1 component, 4 bytes each

  return windTextureBytes + velocityTextureBytes + noiseBytes + indicesBytes <= maxBytes;
}

function javascriptEquivalent(wt: Uint8Array, vt: Uint8Array, noise: Uint8Array, indices: Int32Array, numPixels: number, numNoiseSamples: number, windVx: number, windVz: number, decay: number): void {
  const vx = Math.floor((windVx + 1.0) * 0.5 * 255.0);
  const vz = Math.floor((windVz + 1.0) * 0.5 * 255.0);

  for (let i = 0; i < numPixels; i++) {
    const sampleIndex = (indices[i] + 1) % numNoiseSamples;
    const sample = noise[sampleIndex];

    wt[i*4] = vx;
    wt[i*4+2] = vz;
    wt[i*4+3] = sample;

    vt[i*4+3] /= decay;

    indices[i] = sampleIndex;
  }
}

export function main(): void {
  const USE_JS = true;

  const maxMemory = 128;

  const memory = new WebAssembly.Memory({
    initial: maxMemory,
    maximum: maxMemory
  });

  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');

  if (USE_JS) {
    console.log('Using JS implementation.');
  } else {
    console.log('Using WASM implementation.');
  }

  loadModule(memory).then(mod => {
    const textureSize = 64;
    const numPixels = textureSize * textureSize;
    const numNoiseSamples = 1024;

    if (!checkSize(maxMemory, numPixels, numNoiseSamples)) {
      throw new Error('Out of memory.');
    }

    const wt = mod._fast_grass_new_uint8_array(numPixels*4);
    const vt = mod._fast_grass_new_uint8_array(numPixels*4);
    const noise = mod._fast_grass_new_uint8_array(numPixels);
    const indices = mod._fast_grass_new_int32_array(numPixels);

    const wtArray = makeUint8Array(memory, wt, numPixels*4);
    const vtArray = makeUint8Array(memory, vt, numPixels*4);
    const noiseArray = makeUint8Array(memory, noise, numPixels);
    const indicesArray = makeInt32Array(memory, indices, numPixels);

    const updater = () => {
      if (USE_JS) {
        javascriptEquivalent(wtArray, vtArray, noiseArray, indicesArray, numPixels, numNoiseSamples, 1, 1, 1.1);
      } else {
        mod._fast_grass_update(wt, vt, noise, indices, numPixels, numNoiseSamples, 1, 1, 1.1);
      }
      // drawToCanvas(ctx, canvas);
      window.requestAnimationFrame(updater);
    }

    window.requestAnimationFrame(updater);
  });
}
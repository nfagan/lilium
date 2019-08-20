import { math, debug } from '../gl';
import { BuiltinRealArray, NumberSampler } from '../util';
import { Controller } from '.';

export function getBufferSourceNodeChannelData(bufferSource: AudioBufferSourceNode, channel: number = 0): Float32Array {
  const buffer = bufferSource.buffer;
  return buffer.getChannelData(channel);
}

export function makeRandomizedIndices(out: BuiltinRealArray, numElementsInIndexedData: number): void {
  const gr = math.goldenRatio();
  const numIndices = out.length;

  let value = Math.random();
  
  for (let i = 0; i < numIndices; i++) {
    value += gr;
    value %= 1.0;
    out[i] = Math.floor((numElementsInIndexedData-1) * value);
  }
}

export function makeRandomizedSamplers(numSamplers: number, sourceData: BuiltinRealArray): Array<NumberSampler> {
  //  https://blog.demofox.org/2017/05/29/when-random-numbers-are-too-random-low-discrepancy-sequences/
  const samplers: Array<NumberSampler> = [];

  const gr = math.goldenRatio();
  let value = Math.random();
  
  for (let i = 0; i < numSamplers; i++) {
    const sampler = new NumberSampler(sourceData);
    value += gr;
    value %= 1.0;

    sampler.seek(value);
    samplers.push(sampler);
  }

  return samplers;
}

export function makeNormalizedRandomizedSamplers(numSamplers: number, sourceData: BuiltinRealArray): Array<NumberSampler> {
  //  https://blog.demofox.org/2017/05/29/when-random-numbers-are-too-random-low-discrepancy-sequences/  
  math.normalize01(sourceData, sourceData);
  return makeRandomizedSamplers(numSamplers, sourceData);
}

export function makeAudioBufferSamplers(numSamplers: number, bufferSource: AudioBufferSourceNode): Array<NumberSampler> {
  return makeNormalizedRandomizedSamplers(numSamplers, getBufferSourceNodeChannelData(bufferSource));
}

function addTouchListener(element: HTMLDivElement, func: (v: number) => void): void {
  element.addEventListener('touchstart', e => {
    e.stopPropagation();
    func(1);
  });
  element.addEventListener('touchend', e => {
    e.stopPropagation();
    func(0);
  });
}

export function makeTouchControls(controller: Controller, touchElements: debug.DebugTouchControls): void {
  const directional = controller.directionalInput;
  const jumpButton = controller.jumpButton;

  addTouchListener(touchElements.left, directional.left.bind(directional));
  addTouchListener(touchElements.right, directional.right.bind(directional));
  addTouchListener(touchElements.up, directional.forwards.bind(directional));
  addTouchListener(touchElements.down, directional.backwards.bind(directional));

  touchElements.jump.addEventListener('touchstart', e => {
    e.stopPropagation();
    jumpButton.press();
  });
}
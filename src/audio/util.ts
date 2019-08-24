export function semitoneToFrequency(st: number): number {
  return 440 * Math.pow(2, st/12) / Math.pow(2, 21/12);
}

export function setOpposingValuesAtTime(targetParam: AudioParam, oppositeParam: AudioParam): (a: number, t: number) => void {
  return (a, t) => {
    targetParam.setValueAtTime(a, t);
    oppositeParam.setValueAtTime(1-a, t);
  }
}

export function exponentialRampToOpposingValuesAtTime(targetParam: AudioParam, oppositeParam: AudioParam): (a: number, t: number) => void {
  return (a, t) => {
    targetParam.exponentialRampToValueAtTime(a, t);
    oppositeParam.exponentialRampToValueAtTime(1-a, t);
  }
}

export function setValueAtTime(param: AudioParam): (a: number, t: number) => void {
  return (a, t) => param.setValueAtTime(a, t);
}

export function exponentialRampToValueAtTime(param: AudioParam): (a: number, t: number) => void {
  return (a, t) => param.exponentialRampToValueAtTime(a, t);
}

export function minGain(): number {
  return clampGain(0);
}

export function clampGain(t: number): number {
  return clamp(t, 0.0001, 0.9999);
  // return clamp(t, 0, 1);
}

export function clamp(t: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, t));
}

export function mix(a: number, b: number, t: number) {
  return (1-t) * a + t * b;
}

export function lowerBound(t: number, min: number): number {
  return Math.max(t, min);
}

export function upperBound(t: number, max: number): number {
  return Math.min(t, max);
}

export function smoothStep(t: number): number {
  return 3*t*t - 2*t*t*t;
}

export function smootherStep(t: number): number {
  return 6 * Math.pow(t, 5) - 15 * Math.pow(t, 4) + 10 * Math.pow(t, 3);
}
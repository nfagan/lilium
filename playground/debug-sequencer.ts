import { loadAudioBuffer, asyncTimeout, ObjectToggle, True } from '../src/util';
import { debug, Keyboard, Keys } from '../src/gl';
import { Scheduler, Sequence, types as audioTypes, SequenceNoteOnListener, Delay, Reverb, Pass, Automation, Effect, util as audioUtil } from '../src/audio';
import { NoteCancelFunction, ScheduledNote, IRoutable } from '../src/audio/types';

const keyboard = new Keyboard();

class Envelope implements IRoutable {
  private context: AudioContext;
  private gain: GainNode;

  attack: number;
  sustain: number;
  decay: number;
  release: number;

  constructor(context: AudioContext) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.setValueAtTime(1, context.currentTime);

    this.attack = 0.1;
    this.sustain = audioUtil.clampGain(0);
    this.decay = 0.75;
    this.release = 0.05;
  }

  connectRoutable(to: IRoutable): void {
    to.accept(this.gain);
  }

  connect(to: AudioNode): void {
    this.gain.connect(to);
  }

  disconnectFrom(node: AudioNode): void {
    this.gain.disconnect(node);
  }

  disconnect(): void {
    this.gain.disconnect();
  }

  accept(input: AudioNode): void {
    input.connect(this.gain);
  }

  reject(input: AudioNode): void {
    input.disconnect(this.gain);
  }

  trigger(when: number): void {
    const timeConstantMultiplier = 4;
    const minGain = audioUtil.clampGain(0);

    this.gain.gain.setValueAtTime(minGain, when);
    this.gain.gain.setTargetAtTime(1, when, this.attack/timeConstantMultiplier);
    this.gain.gain.setTargetAtTime(this.sustain, when + this.attack, this.decay/timeConstantMultiplier);
    this.gain.gain.setTargetAtTime(minGain, when + this.attack + this.decay, this.release/timeConstantMultiplier);
  }

  set(value: number, time: number): void {
    value = audioUtil.clampGain(value);
    this.gain.gain.setValueAtTime(value, time);
  }
}

class Synth implements IRoutable {
  private context: AudioContext;
  private oscillator: OscillatorNode;
  private envelope: Envelope;
  private isConnected: boolean;
  private isStopped: boolean;

  constructor(context: AudioContext) {
    this.context = context;
    this.oscillator = this.context.createOscillator();
    this.envelope = new Envelope(context);
    this.oscillator.type = 'sine';
    this.envelope.accept(this.oscillator);
    this.isConnected = false;
    this.isStopped = false;
  }

  accept(input: AudioNode): void {
    throw new Error('Synth cannot accept input.');
  }

  connect(to: AudioNode): void {
    this.envelope.connect(to);
    this.isConnected = true;
  }

  connectRoutable(to: IRoutable): void {
    this.envelope.connectRoutable(to);
    this.isConnected = true;
  }

  disconnectFrom(node: AudioNode): void {
    if (this.isConnected) {
      this.envelope.reject(this.oscillator);
      this.envelope.disconnectFrom(node);
      this.isConnected = false;
    }
  }

  disconnect(): void {
    if (this.isConnected) {
      this.envelope.disconnect();
      this.isConnected = false;
    }
  }

  start(frequency: number, time: number): void {
    this.envelope.trigger(time);
    this.oscillator.frequency.setValueAtTime(frequency, time);
    this.oscillator.start(time);
  }

  cancel(time: number): void {
    this.envelope.set(0, time);
    this.stop(time);
  }

  stop(time: number): void {
    if (!this.isStopped) {
      this.oscillator.stop(time);
      this.isStopped = true;
    }
  }
}

type Sounds = {
  [k: string]: AudioBuffer
  piano: AudioBuffer,
  kick: AudioBuffer
}

type Effects = {
  delay: Effect
  reverb: Effect
}

function makeAudioContext(): AudioContext {
  return new (window.AudioContext || (<any>window).webkitAudioContext)();
}

function soundUrl(filename: string): string {
  return '/sound/' + filename;
}

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  return {
    piano: await asyncTimeout(() => loadAudioBuffer(audioContext, soundUrl('piano_g.mp3')), 5e3),
    kick: await asyncTimeout(() => loadAudioBuffer(audioContext, soundUrl('kick.wav')), 5e3)
  };
}

function makeEffects(audioContext: AudioContext): Effects {
  return {
    delay: new Delay(audioContext),
    reverb: new Reverb(audioContext)
  };
}

function semitoneJitter(amount: number): number {
  const sign = Math.random() > 0.5 ? -1 : 1;
  return Math.random() * amount * sign;
}

function pentatonicMaker(): () => number {
  let semitoneIdx = 0;

  return () => {
    const jitter = 0.12;
    const semitones = [0, 3, 5, 7, 10, 7, 5, 3];
    const keyOffset = 0;
    const semitone = semitones[semitoneIdx] + keyOffset;
    const pitch = semitone + semitoneJitter(jitter);

    semitoneIdx++;
    semitoneIdx %= semitones.length;

    return pitch;
  }
}

function pentatonic(audioContext: AudioContext, sounds: Sounds): () => void {
  const soundToggle = new ObjectToggle<AudioBuffer, Sounds>(sounds);
  let semitoneIdx = 0;

  const player = () => {
    const jitter = 0.12;
    const semitones = [0, 3, 5, 7, 10, 7, 5, 3];
    const keyOffset = 0;
    const semitone = semitones[semitoneIdx] + keyOffset;
    const pitch = semitone + semitoneJitter(jitter);

    const src = audioContext.createBufferSource();
    src.buffer = soundToggle.current();
    src.playbackRate.value = Math.pow(2, pitch/12);

    src.connect(audioContext.destination);
    src.start();

    semitoneIdx++;
    semitoneIdx %= semitones.length;
  }

  return player;
}

function noteOnAudioBuffer(buffer: AudioBuffer, effects: Effects): audioTypes.NoteOnFunction {
  return (context, note, startTime, seqTime) => playAudioBuffer(context, context.destination, buffer, effects, note, startTime);
}

function noteOnSynth(effects: Effects): audioTypes.NoteOnFunction {
  return (context, note, startTime, relativeTime) => playSynth(context, context.destination, effects, note, startTime);
}

function playSynth(audioContext: AudioContext, destination: AudioDestinationNode, effects: Effects, note: audioTypes.Note, when: number): NoteCancelFunction {
  const semitone = note.semitone + 12;
  const freq = audioUtil.semitoneToFrequency(semitone);

  const synth = new Synth(audioContext);

  synth.connectRoutable(effects.delay);
  effects.delay.connectRoutable(effects.reverb);
  effects.reverb.connect(destination);

  synth.start(freq, when);
  synth.stop(when + 1);

  return () => {
    synth.cancel(0);
    synth.disconnect();
  }
}

function playAudioBuffer(audioContext: AudioContext, destination: AudioDestinationNode, buffer: AudioBuffer, effects: Effects, note: audioTypes.Note, when: number = 0): NoteCancelFunction {
  const semitone = note.semitone;

  const src = audioContext.createBufferSource();
  const delay = effects.delay;
  const reverb = effects.reverb;

  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, semitone/12);

  let stopped = false;

  // src.connect(destination);
  delay.accept(src);
  delay.connectRoutable(reverb);
  reverb.connect(destination);

  src.start(when);
  src.onended = () => stopped = true;

  return () => {
    if (!stopped) {
      src.stop(0);
      stopped = true;
    }
  }
}

function makeCanvas(appendTo: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '50%';
  appendTo.appendChild(canvas);
  return canvas;
}

function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas;
  const boundRect = canvas.getBoundingClientRect();
  canvas.width = boundRect.width * (window.devicePixelRatio || 1);
  canvas.height = boundRect.height * (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function smoothStep(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

function drawSequence(ctx: CanvasRenderingContext2D, sequenceListener: SequenceNoteOnListener, 
  sequence: Sequence, scheduler: Scheduler, metronomeListener: SequenceNoteOnListener): void {
  clearCanvas(ctx);
  
  const canvas = ctx.canvas;
  const w = 20;
  const h = canvas.height;

  ctx.globalAlpha = 1;

  const activeNote = sequenceListener.activeNote();
  // const t = sequenceListener.tNextNote();
  const numMeasures = sequence.actualNumMeasures();
  const measOffset = sequence.getMeasureOffset();
  const subsectionMeasures = sequence.numMeasures();

  for (let i = 0; i < numMeasures; i++) {
    ctx.strokeStyle = 'black';
    ctx.strokeRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);
  }

  const minNote = -12;
  const maxNote = 12;
  const noteSpan = maxNote - minNote;

  for (let i = 0; i < noteSpan; i++) {
    const y = i / noteSpan * canvas.height;
    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const notes: Array<ScheduledNote> = [];
  sequence.getScheduledNotes(notes);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    const yAmt = 1 - Math.max(0, Math.min((note.semitone - minNote) / noteSpan, 1));
    const h = canvas.height * (1 / noteSpan);
    const y = yAmt * canvas.height - h;

    const t = sequenceListener.tNote(note.relativeStartTime, note.semitone);

    const relStart = note.relativeStartTime;
    const measNote = Math.floor(relStart);
    // const color = relStart === activeNote ? (1-t) * 255 : 0;
    const color = (1-t) * 255;
    const isWithinSubsection = (measNote < measOffset || measNote >= subsectionMeasures + measOffset);
    const subsectionAlpha = isWithinSubsection ? 0.25 : 1.0;

    ctx.fillStyle = `rgb(${color}, ${255}, ${255})`;
    ctx.globalAlpha = subsectionAlpha;
    ctx.fillRect(canvas.width * relStart / numMeasures, y, w, h);
    ctx.globalAlpha = 1;
  }

  const seqW = 10;
  ctx.strokeStyle = sequence.isSubsectioned() ? 'green' : 'red';
  const x0 = sequenceListener.tSequence() * canvas.width;
  ctx.strokeRect(x0, 0, seqW, h);
}

function drawAutomation(ctx: CanvasRenderingContext2D, scheduler: Scheduler, automation: Automation, listener: SequenceNoteOnListener): void {
  clearCanvas(ctx);

  const sequence = automation.sequence;
  const canvas = ctx.canvas;
  const t = sequence.subsectionRelativeCurrentTime();
  const value = 1 - automation.getValueAt(t);
  const fracT = Math.min(t / sequence.actualNumMeasures(), 1);

  const samplePoints = automation.getSamplePoints();

  for (let i = 0; i < samplePoints.length; i++) {
    ctx.strokeStyle = 'red';
    const x = samplePoints[i].relativeTime / sequence.actualNumMeasures();
    const y = 1 - samplePoints[i].value;

    ctx.beginPath();
    ctx.arc(x * canvas.width, y * canvas.height, 30, 0, 2*Math.PI);
    ctx.stroke();
  }

  if (!scheduler.isPlaying()) {
    return;
  }
  
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(fracT * canvas.width, value * canvas.height, 20, 0, 2*Math.PI);
  ctx.fill();
}

function scheduleEffects(effects: Effects, value: number, t: number): void {
  effects.delay.ramp('wetAmount', 0.25 * value, t);
  effects.delay.ramp('delayTime', 0.5 * value, t);
  effects.delay.ramp('feedback', 0.25, t);
  
  effects.reverb.ramp('wetAmount', 0.5, t);
}

function setAutomation(automation: Automation, effects: Effects, startTime: number, currentTime: number): void {
  const samplePoints = automation.getSamplePoints();
  const sequence = automation.sequence;
  const measureDuration = sequence.measureDurationSecs();
  const sequenceDuration = sequence.subsectionDurationSecs();
  const measureOffset = sequence.getMeasureOffset();
  const finishTime = startTime + sequenceDuration;

  for (let i = 0; i < samplePoints.length; i++) {
    const point = samplePoints[i];
    const t = (point.relativeTime - measureOffset) * measureDuration + startTime;
    const value = point.value;

    if (t >= currentTime && t < finishTime) {
      scheduleEffects(effects, value, t);
    }

    if (i === 0) {
      const nextT = t + sequenceDuration;

      if (nextT >= currentTime) {
        scheduleEffects(effects, value, nextT);
      }
    }
  } 
}

function cancelScheduledEffects(effects: Effects, after: number): void {
  effects.delay.cancelScheduledValues(after);
  effects.reverb.cancelScheduledValues(after);
}

function configureEffectAutomation(automation: Automation, effects: Effects, audioContext: AudioContext): void {
  automation.sequence.addBeforeScheduleTask((sequence, newStartTime) => {
    const currentTime = audioContext.currentTime;

    cancelScheduledEffects(effects, Math.max(newStartTime, currentTime));
    setAutomation(automation, effects, newStartTime, currentTime);
  });
}

function makePianoRoll(keyboard: Keyboard, cb: (note: audioTypes.Note) => void): void {
  ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l'].map((keyName, i) => {
    keyboard.addAnonymousListener(Keys[keyName], () => cb(audioTypes.makeNote(i)));
  });
}

export async function main(): Promise<void> {
  //  Sequence stack
  //  Effect stack -- Affects 4 adjacent sequences
  //    Arpeggiator, Eq
  //  Order stack -- At end of sequence, jump to another sequence
  //    Random, adjacent, source / destination
  //  Density of sequences at point -> amount of reverb

  debug.maximizeDocumentBody();

  let beganLooping = false;

  const canvas = makeCanvas(document.body);
  const ctx = canvas.getContext('2d');

  const audioContext = makeAudioContext();
  const sounds = await makeSounds(audioContext);
  const bpm = 120;

  const player = pentatonic(audioContext, sounds);
  const sequenceEffects = makeEffects(audioContext);
  const metronomeEffects = makeEffects(audioContext);
  // const noteOnFunc = noteOnAudioBuffer(sounds.piano, sequenceEffects);
  const metronomeNoteOnFunc = noteOnAudioBuffer(sounds.piano, metronomeEffects);

  const synth = new Synth(audioContext);
  const noteOnFunc = noteOnSynth(sequenceEffects);

  const scheduler = new Scheduler(audioContext, new audioTypes.TimeSignature(2, 4), bpm);
  const sequence = scheduler.makeSequence(noteOnFunc);

  const pentScale = pentatonicMaker();

  const metronome = scheduler.makeSequence(metronomeNoteOnFunc);
  metronome.addMeasures(1);
  metronome.scheduleNoteOnset(0, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.25, audioTypes.makeNote(-12));
  metronome.scheduleNoteOnset(0.5, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.75, audioTypes.makeNote(10));

  sequence.addMeasures(1);
  sequence.scheduleNoteOnset(0, audioTypes.makeNote(-12));

  keyboard.addAnonymousListener(Keys.up, () => scheduler.setBpm(scheduler.getBpm() + 5));
  keyboard.addAnonymousListener(Keys.down, () => scheduler.setBpm(scheduler.getBpm() - 5));

  const dummySequences: Array<Sequence> = [];

  for (let i = 0; i < 1000; i++) {
    const seq = scheduler.makeSequence(noteOnFunc);
    seq.addMeasures(2);
    seq.loop = true;
    dummySequences.push(seq);
  }

  makePianoRoll(keyboard, note => {
    sequence.markNoteOnset(note);
    playSynth(audioContext, audioContext.destination, sequenceEffects, note, audioContext.currentTime);
  });

  const sequenceListener = new SequenceNoteOnListener(scheduler, sequence);
  const metronomeListener = new SequenceNoteOnListener(scheduler, metronome);

  const automation = new Automation(sequence);

  keyboard.addAnonymousListener(Keys.n, () => sequence.addMeasure());
  keyboard.addAnonymousListener(Keys.r, () => {
    const measIndex = sequence.currentMeasureIndex();
    const success = sequence.removeMeasureAndCancel(measIndex);
    
    if (success) {
      automation.removeMeasure(measIndex);
    }
  });

  keyboard.addAnonymousListener(Keys.c, () => {
    sequence.clearMeasureAndCancel(sequence.currentMeasureIndex());
  });

  let hasSubsection = false;

  keyboard.addAnonymousListener(Keys.v, () => {
    if (hasSubsection) {
      scheduler.clearSequenceSubsection(sequence);
    } else {
      scheduler.subsectionSequence(sequence, sequence.currentMeasureIndex(), 1);
    }

    hasSubsection = !hasSubsection;
  });

  const beginLoop = () => {
    sequence.loop = true;
    sequence.allowRecord = true;
    metronome.loop = true;
    let nextStartTime = scheduler.nextQuantumTime();

    if (!scheduler.isPlaying()) {
      scheduler.play();
      nextStartTime = scheduler.currentQuantumTime();
    }

    scheduler.cancelIf(True, (seq, relStart) => Math.floor(relStart) > seq.currentMeasureIndex());
    scheduler.removeAll();

    scheduler.scheduleSequence(sequence, nextStartTime);
    dummySequences.map(seq => scheduler.scheduleSequence(seq, nextStartTime));
    // scheduler.scheduleSequence(metronome, nextStartTime);
  }

  const recorder = () => {
    const note = audioTypes.makeNote(pentScale());
    sequence.markNoteOnset(note);
    // playAudioBuffer(audioContext, audioContext.destination, sounds.piano, sequenceEffects, note);
    playSynth(audioContext, audioContext.destination, sequenceEffects, note, audioContext.currentTime);
  }

  canvas.addEventListener('mousedown', e => {
    if (!beganLooping) {
      beginLoop();
      beganLooping = true;
    }

    player();
  });

  keyboard.addAnonymousListener(Keys.space, () => {
    if (scheduler.isPlaying()) {
      scheduler.stop();
      sequence.allowRecord = false;
    } else {
      beginLoop();
    }
  });

  canvas.addEventListener('touchstart', e => {
    if (!beganLooping) {
      beginLoop();
      beganLooping = true;
    }

    for (let i = 0; i < e.touches.length; i++) {
      recorder();
    }
  });

  const automationCanvas = makeCanvas(document.body);
  const automationCtx = automationCanvas.getContext('2d');
  // automation.addSample(0.75, 0.5);
  // automation.addSample(0.5, 0.25);
  automationCanvas.addEventListener('click', e => {
    const boundRect = automationCanvas.getBoundingClientRect();
    const x = (e.clientX - boundRect.left) / boundRect.width * sequence.actualNumMeasures();
    const y = 1 - (e.clientY - boundRect.top) / boundRect.height;

    automation.addSample(y, x);

    const startTime = automation.sequence.getStartTime();
    const currentTime = scheduler.currentTime();

    cancelScheduledEffects(sequenceEffects, currentTime);
    setAutomation(automation, sequenceEffects, startTime, currentTime);
  });

  keyboard.addAnonymousListener(Keys.k, () => automation.mergeSamplesWithinDistance(0.1));

  const metronomeAutomation = new Automation(metronome);
  metronomeAutomation.addSample(1, 0);

  configureEffectAutomation(automation, sequenceEffects, audioContext);
  configureEffectAutomation(metronomeAutomation, metronomeEffects, audioContext);

  const updater = () => {
    scheduler.update();
    sequenceListener.update();
    metronomeListener.update();

    drawSequence(ctx, sequenceListener, sequence, scheduler, metronomeListener);
    drawAutomation(automationCtx, scheduler, automation, sequenceListener);

    window.requestAnimationFrame(updater);
  }

  window.requestAnimationFrame(updater);
}
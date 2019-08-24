import { loadAudioBuffer, asyncTimeout } from '../src/util';
import { debug as glDebug, Keyboard, Keys } from '../src/gl';
import { Scheduler, Sequence, types as audioTypes, SequenceNoteOnListener, Delay, Reverb, Pass, 
  Automation, Effect, util as audioUtil, debug, Envelope } from '../src/audio';
import { NoteCancelFunction, ScheduledNote, Note, NoteOnFunction, makeScheduledNote, copyScheduledNote } from '../src/audio/types';

const keyboard = new Keyboard();

type Effects = {
  delay: Effect
  reverb: Effect
}

class Synth {
  private context: AudioContext;
  private envelope: Envelope;
  private oscillator: OscillatorNode;
  private pendingNotes: Array<ScheduledNote>;

  constructor(context: AudioContext) {
    this.context = context;
    this.oscillator = context.createOscillator();
    this.envelope = new Envelope(context);
    this.pendingNotes = [];

    this.route();
    this.configureEnvelope();

    this.oscillator.start(0);
  }

  private route(): void {
    this.envelope.accept(this.oscillator);
    this.envelope.connect(this.context.destination);
  }

  cancel(): void {
    this.envelope.cancel(this.context.currentTime);
    this.oscillator.frequency.cancelScheduledValues(this.context.currentTime);
  }

  attachToSequence(sequence: Sequence): void {
    sequence.addBeforeScheduleTask((sequence, start) => this.clearPendingNotes());
    sequence.addAfterScheduleTask(sequence => {
      this.conditionalWrapAroundNotes(sequence);
      this.schedulePendingNotes();
    });
  }

  private configureEnvelope() {
    this.envelope.attack = 0.1;
    this.envelope.decay = 0.5;
    this.envelope.sustain = 0;
    this.envelope.release = 0.05;
  }

  private clearPendingNotes(): void {
    this.pendingNotes = [];
  }

  private conditionalWrapAroundNotes(sequence: Sequence): void {
    if (this.pendingNotes.length === 0) {
      return;
    }

    const duration = sequence.durationSecs();
    const firstNote = copyScheduledNote(this.pendingNotes[0]);
    firstNote.startTime = firstNote.startTime + duration;
    this.pendingNotes.push(firstNote);
  }

  private schedulePendingNotes(): void {
    //  length-1 to avoid the wrapped-around note.
    for (let i = 0; i < this.pendingNotes.length-1; i++) {
      const note = this.pendingNotes[i];
      const freq = audioUtil.semitoneToFrequency(note.semitone);
      this.oscillator.frequency.setValueAtTime(freq, note.startTime);
    }

    this.envelope.triggerNotes(this.pendingNotes);
  }

  noteOnFunction(): NoteOnFunction {
    return (audioContext: AudioContext, note: Note, startTime: number, sequenceRelativeStartTime: number) => {
      return this.pushNote(makeScheduledNote(sequenceRelativeStartTime, startTime, note));
    }
  }

  private pushNote(note: ScheduledNote): NoteCancelFunction {
    this.pendingNotes.push(note);
    return () => this.cancel();
  }
}

function makeAudioContext(): AudioContext {
  return new (window.AudioContext || (<any>window).webkitAudioContext)();
}

function makeEffects(audioContext: AudioContext): Effects {
  return {
    delay: new Delay(audioContext),
    reverb: new Reverb(audioContext)
  };
}

function makeCanvas(appendTo: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '50%';
  appendTo.appendChild(canvas);
  return canvas;
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

function startContext(context: AudioContext): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.setValueAtTime(audioUtil.minGain(), context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.25);
}

export async function main(): Promise<void> {
  glDebug.maximizeDocumentBody();

  const canvas = makeCanvas(document.body);
  const ctx = canvas.getContext('2d');

  const bpm = 120;
  const audioContext = makeAudioContext();
  const scheduler = new Scheduler(audioContext, new audioTypes.TimeSignature(2, 4), bpm);

  const synth = new Synth(audioContext);
  const noteOnFunc = synth.noteOnFunction();

  const sequenceEffects = makeEffects(audioContext);
  const sequence = scheduler.makeSequence(noteOnFunc);
  const sequenceListener = new SequenceNoteOnListener(scheduler, sequence);
  const automation = new Automation(sequence);

  synth.attachToSequence(sequence);

  sequence.addMeasures(1);
  sequence.loop = true;
  sequence.scheduleNoteOnset(0.25, audioTypes.makeNote(12));
  sequence.scheduleNoteOnset(0.3, audioTypes.makeNote(10));
  // sequence.scheduleNoteOnset(0.5, audioTypes.makeNote(10));

  keyboard.addAnonymousListener(Keys.up, () => scheduler.setBpm(scheduler.getBpm() + 5));
  keyboard.addAnonymousListener(Keys.down, () => scheduler.setBpm(scheduler.getBpm() - 5));

  makePianoRoll(keyboard, note => {
    sequence.markNoteOnset(note);
  });

  keyboard.addAnonymousListener(Keys.n, () => sequence.addMeasure());
  keyboard.addAnonymousListener(Keys.r, () => {
    const measIndex = sequence.currentMeasureIndex();
    if (sequence.removeMeasureAndCancel(measIndex)) {
      automation.removeMeasure(measIndex);
    }
  });
  keyboard.addAnonymousListener(Keys.v, () => {
    if (sequence.isSubsectioned()) {
      scheduler.clearSequenceSubsection(sequence);
    } else {
      scheduler.subsectionSequence(sequence, sequence.currentMeasureIndex(), 1);
    }
  });

  keyboard.addAnonymousListener(Keys.c, () => sequence.clearMeasureAndCancel(sequence.currentMeasureIndex()));

  let firstPlay = true;

  keyboard.addAnonymousListener(Keys.space, () => {
    if (scheduler.isPlaying()) {
      scheduler.stop();
      synth.cancel();
      sequence.allowRecord = false;
    } else {
      scheduler.play();
      scheduler.scheduleSequence(sequence, scheduler.currentQuantumTime());
      sequence.allowRecord = true;

      if (firstPlay) {
        startContext(audioContext);
        firstPlay = false;
      }
    }
  });

  const automationCanvas = makeCanvas(document.body);
  const automationCtx = automationCanvas.getContext('2d');
  automation.addSample(1, 0);

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

  configureEffectAutomation(automation, sequenceEffects, audioContext);

  const updater = () => {
    scheduler.update();
    sequenceListener.update();

    debug.drawSequence(ctx, sequence, sequenceListener);
    debug.drawAutomation(automationCtx, scheduler, automation, sequenceListener);

    window.requestAnimationFrame(updater);
  }

  window.requestAnimationFrame(updater);
}
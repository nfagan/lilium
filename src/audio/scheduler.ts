import { Note, NoteOnFunction, Quantization, TimeSignature, copyTimeSignature, NoteCancelFunction } from './types';

type LoopingSequence = {
  sequence: Sequence,
  noteOnFunction: NoteOnFunction,
}

type ScheduledSequence = {
  sequence: Sequence,
  sequenceRelativeStarts: Array<number>,
  cancelFunctions: Array<NoteCancelFunction>;
  finishTime: number
}

type ScheduledNote = Note & {
  relativeStartTime: number
};

function makeScheduledNote(relativeStartTime: number, note: Note): ScheduledNote {
  return {relativeStartTime, ...note};
}

function copyScheduledNote(note: ScheduledNote): ScheduledNote {
  return {...note};
}

class FrameTimer {
  private lastTime: number;
  private iter: number;
  private minUpdatesToBegin: number;
  private numUpdates: number;
  private sampleSize: number;
  private deltas: Array<number>;

  constructor(minUpdatesToBegin: number, sampleSize: number) {
    this.lastTime = NaN;
    this.iter = 0;
    this.minUpdatesToBegin = minUpdatesToBegin;
    this.numUpdates = 0;
    this.sampleSize = sampleSize;
    this.deltas = [];
  }

  meanDelta(): number {
    let sum = 0;

    for (let i = 0; i < this.deltas.length; i++) {
      sum += this.deltas[i];
    }

    return sum / this.deltas.length;
  }

  update(currentTime: number): void {
    const delta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.numUpdates >= this.minUpdatesToBegin) {
      this.deltas[this.iter++] = delta;
      this.iter %= this.sampleSize;
    }

    this.numUpdates++;
  }
}

export class Scheduler {
  readonly timeSignature: TimeSignature
  private bpm: number;

  private audioContext: AudioContext;
  private startTime: number;
  private quantization: Quantization;

  private loopingSequences: {[key: number]: LoopingSequence};
  private scheduledSequences: Array<ScheduledSequence>;

  private frameTimer: FrameTimer;

  constructor(audioContext: AudioContext, timeSignature: TimeSignature, bpm: number, quantization: Quantization) {
    this.audioContext = audioContext;
    this.startTime = audioContext.currentTime;
    this.timeSignature = copyTimeSignature(timeSignature);
    this.bpm = bpm;
    this.quantization = quantization;
    this.loopingSequences = {};
    this.scheduledSequences = [];
    this.frameTimer = new FrameTimer(20, 10);
  }

  secsToRelativeTime(secs: number): number {
    return secs < 0 ? -1 : secs / this.timeSignature.durationSecs(1, this.bpm);
  }

  relativeTimeToSecs(relTime: number): number {
    return relTime < 0 ? -1 : this.timeSignature.durationSecs(relTime, this.bpm);
  }

  getBpm(): number {
    return this.bpm;
  }

  setBpm(bpm: number): void {
    this.cancelScheduled();

    this.bpm = bpm;
    this.startTime = this.currentTime();

    for (let seqId in this.loopingSequences) {
      const loopingSequence = this.loopingSequences[seqId];

      if (loopingSequence !== undefined) {
        this.scheduleLoopingSequence(loopingSequence);
      }
    }
  }

  private updateLooping(currentTime: number): void {
    for (let seqId in this.loopingSequences) {
      const loopingSequence = this.loopingSequences[seqId];

      if (loopingSequence === undefined) {
        continue;
      }

      const sequence = loopingSequence.sequence;
      const deadline = sequence.startTime + sequence.durationSecs() - this.loopLookahead();

      if (currentTime >= deadline && sequence.loop) {
        this.scheduleLoopingSequence(loopingSequence);
      }
    }
  }

  private updateScheduled(currentTime: number): void {
    let offset = 0;

    for (let i = 0; i < this.scheduledSequences.length; i++) {
      const seq = this.scheduledSequences[i-offset];

      if (currentTime >= seq.finishTime) {
        this.scheduledSequences.splice(i-offset, 1);
        offset++;
      }
    }
  }

  private cancelScheduled(): void {
    for (let i = 0; i < this.scheduledSequences.length; i++) {
      const cancelFuncs = this.scheduledSequences[i].cancelFunctions;
      
      for (let j = 0; j < cancelFuncs.length; j++) {
        cancelFuncs[j]();
      }
    }

    this.scheduledSequences = [];
  }

  cancel(): void {
    this.cancelScheduled();
  }

  cancelIfMatchingSequenceIdAndMeasure(id: number, measure: number): void {
    this.cancelIf(seq => seq.id === id, start => Math.floor(start) === measure);
  }

  cancelIf(sequenceCondition: (seq: Sequence) => boolean, noteCondition: (start: number) => boolean): void {
    for (let i = 0; i < this.scheduledSequences.length; i++) {
      const sequence = this.scheduledSequences[i].sequence;

      if (!sequenceCondition(sequence)) {
        continue;
      }

      const starts = this.scheduledSequences[i].sequenceRelativeStarts;
      const cancelFuncs = this.scheduledSequences[i].cancelFunctions;

      for (let j = 0; j < starts.length; j++) {
        if (noteCondition(starts[j])) {
          cancelFuncs[j]();
        }
      }
    }
  }

  update(): void {
    const currentTime = this.currentTime();
    this.frameTimer.update(currentTime);

    this.updateLooping(currentTime);
    this.updateScheduled(currentTime);
  }

  currentTime(): number {
    return this.audioContext.currentTime;
  }

  initialTime(): number {
    return this.startTime;
  }

  private hasLoopingSequence(id: number): boolean {
    return this.loopingSequences[id] !== undefined;
  }

  private quantumDuration(): number {
    switch (this.quantization) {
      case Quantization.Whole:
        return this.timeSignature.durationSecs(1, this.bpm);
      case Quantization.Half:
        return this.timeSignature.durationSecs(1/2, this.bpm);
      case Quantization.Quarter:
        return this.timeSignature.durationSecs(1/4, this.bpm);
    }
  }

  elapsedTime(): number {
    return this.currentTime() - this.startTime;
  }

  private nextQuantumTime(): number {
    const quantumDuration = this.quantumDuration();
    const elapsedTime = this.elapsedTime();
    const currTime = this.currentTime();
    const nextQuantum = Math.ceil(elapsedTime / quantumDuration);
    return nextQuantum * quantumDuration - elapsedTime + currTime;
  }

  makeSequence(): Sequence {
    return new Sequence(this);
  }

  private loopLookahead(): number {
    const meanDelta = this.frameTimer.meanDelta();

    if (isNaN(meanDelta)) {
      return 10/60;
    } else {
      return meanDelta * 3; //  3 frames
    }
  }

  private scheduleLoopingSequence(loopingSequence: LoopingSequence): void {
    this.scheduleSequence(loopingSequence.sequence, loopingSequence.noteOnFunction);
  }

  scheduleSequence(sequence: Sequence, noteOnFunction: NoteOnFunction): void {
    const nextStartTime = this.nextQuantumTime();
    const audioContext = this.audioContext;

    if (sequence.startTime > this.currentTime()) {
      //  Already scheduled.
      return;
    }

    sequence.triggerBeforeScheduleTasks();
    // sequence.clearBeforeScheduleTasks();
    sequence.startTime = nextStartTime;

    const numNotes = sequence.countNotes();
    let noteIndex = 0;
    let measureOffset = 0;

    const cancelFunctions: Array<NoteCancelFunction> = [];
    const sequenceRelativeStarts: Array<number> = [];

    for (let i = 0; i < sequence.measures.length; i++) {
      const measure = sequence.measures[i];
      const measureDuration = measure.durationSecs(this.bpm);

      for (let j = 0; j < measure.notes.length; j++) {
        const note = measure.notes[j];
        const noteTime = note.relativeStartTime * measureDuration;
        const startTime = noteTime + nextStartTime + measureOffset;
        const sequenceRelativeTime = note.relativeStartTime + i;

        const cancelFunc = noteOnFunction(audioContext, note, startTime, noteIndex, numNotes, sequenceRelativeTime);

        cancelFunctions.push(cancelFunc);
        sequenceRelativeStarts.push(sequenceRelativeTime);

        noteIndex++;
      }

      measureOffset += measureDuration;
    }

    this.scheduledSequences.push({
      sequence,
      cancelFunctions,
      sequenceRelativeStarts,
      finishTime: nextStartTime + sequence.durationSecs()
    });

    if (sequence.loop) {
      this.loopingSequences[sequence.id] = {
        sequence,
        noteOnFunction
      }

    } else if (this.hasLoopingSequence(sequence.id)) {
      this.loopingSequences[sequence.id] = undefined;
    }
  }
}

class Measure {
  readonly timeSignature: TimeSignature;
  notes: Array<ScheduledNote>; //  semitones

  constructor(timeSignature: TimeSignature) {
    this.timeSignature = copyTimeSignature(timeSignature);
    this.notes = [];
  }

  clear(): void {
    this.notes = [];
  }

  countNotes(): number {
    return this.notes.length;
  }

  isEmpty(): boolean {
    return this.notes.length === 0;
  }

  durationSecs(atBpm: number): number {
    return this.timeSignature.durationSecs(1, atBpm);
  }

  addNote(relativeStartTime: number, note: Note): void {
    relativeStartTime = Math.max(0, Math.min(1, relativeStartTime));
    this.notes.push(makeScheduledNote(relativeStartTime, note));
    this.notes.sort((a, b) => a.relativeStartTime - b.relativeStartTime);
  }

  lastRelativeNoteTime(): number {
    if (this.notes.length === 0) {
      return -1;
    }

    return this.notes[this.notes.length-1].relativeStartTime;
  }

  firstRelativeNoteTime(): number {
    if (this.notes.length === 0) {
      return -1;
    }

    return this.notes[0].relativeStartTime;
  }

  previousRelativeNoteTime(before: number, allowEqual: boolean = false): number {
    for (let i = this.notes.length-1; i >= 0; i--) {
      const relStart = this.notes[i].relativeStartTime;
      const crit = allowEqual ? relStart <= before : relStart < before;

      if (crit) {
        return this.notes[i].relativeStartTime;
      }
    }

    return -1;
  }

  nextRelativeNoteTime(after: number, allowEqual: boolean = false): number {
    for (let i = 0; i < this.notes.length; i++) {
      const relStart = this.notes[i].relativeStartTime;
      const crit = allowEqual ? relStart >= after : relStart > after;

      if (crit) {
        return this.notes[i].relativeStartTime;
      }
    }

    return -1;
  }

  copy(): Measure {
    const b = new Measure(this.timeSignature);

    for (let i = 0; i < this.notes.length; i++) {
      b.notes.push(copyScheduledNote(this.notes[i]));
    }

    return b;
  }
}

export class Sequence {
  private scheduler: Scheduler;

  startTime: number;

  readonly measures: Array<Measure>;
  readonly id: number;

  loop: boolean;
  allowRecord: boolean;

  onBeforeSchedule: Array<(seq: Sequence) => void>;

  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler;
    this.startTime = scheduler.initialTime();
    this.measures = [];
    this.id = Sequence.ID++;
    this.loop = false;
    this.allowRecord = true;
    this.onBeforeSchedule = [];
  }

  clearBeforeScheduleTasks(): void {
    this.onBeforeSchedule = [];
  }

  triggerBeforeScheduleTasks(): void {
    for (let i = 0; i < this.onBeforeSchedule.length; i++) {
      this.onBeforeSchedule[i](this);
    }
  }

  addBeforeScheduleTask(task: (seq: Sequence) => void): void {
    this.onBeforeSchedule.push(task);
  }

  countNotes(): number {
    let numNotes = 0;

    for (let i = 0; i < this.measures.length; i++) {
      numNotes += this.measures[i].countNotes();
    }

    return numNotes;
  }

  relativeNoteTimes(into: Array<number>): void {
    let index = 0;

    for (let i = 0; i < this.measures.length; i++) {
      const measure = this.measures[i];

      for (let j = 0; j < measure.notes.length; j++) {
        const noteTime = measure.notes[j].relativeStartTime + i;

        if (index < into.length-1) {
          into[index] = noteTime;
        } else {
          into.push(noteTime)
        }

        index++;
      }
    }
  }

  numMeasures(): number {
    return this.measures.length;
  }

  elapsedTime(): number {
    const elapsed = this.scheduler.currentTime() - this.startTime;

    if (elapsed < 0) {
      return elapsed + this.durationSecs();
    } else {
      return elapsed;
    }
  }

  measureDurationSecs(): number {
    if (this.numMeasures() === 0) {
      return 0;
    } else {
      return this.measures[0].durationSecs(this.scheduler.getBpm());
    }
  }

  durationSecs(): number {
    let duration = 0;

    for (let i = 0; i < this.measures.length; i++) {
      duration += this.measures[i].durationSecs(this.scheduler.getBpm());
    }

    return duration;
  }

  clearMeasure(atIdx: number): void {
    if (atIdx < 0 || atIdx >= this.numMeasures()) {
      return;
    }

    this.measures[atIdx].clear();
  }

  removeMeasure(atIdx: number): void {
    if (atIdx < 0 || atIdx >= this.numMeasures()) {
      return;
    }

    this.measures.splice(atIdx, 1);
  }

  addMeasure(): void {
    this.measures.push(new Measure(this.scheduler.timeSignature));
  }

  addMeasures(numMeasures: number): void {
    for (let i = 0; i < numMeasures; i++) {
      this.addMeasure();
    }
  }

  private measureIndex(a: number): number {
    return Math.floor(a) % this.numMeasures();
  }

  private fraction(a: number): number {
    return a - Math.floor(a);
  }

  relativeTimeToSecs(relTime: number): number {
    return this.scheduler.relativeTimeToSecs(relTime);
  }

  relativeCurrentTime(): number {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0) {
      return -1;
    }

    return this.elapsedTime() / this.measureDurationSecs();
  }

  relativeNoteDistanceToNext(t: number): number {
    return this.relativeNoteDistance(t, this.nextRelativeNoteTime(t));
  }

  relativeNoteDistance(a: number, b: number): number {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0 || a < 0 || b < 0) {
      return -1;
    }

    const indA = this.measureIndex(a);
    const indB = this.measureIndex(b);
    
    const fracA = this.fraction(a);
    const fracB = this.fraction(b);

    if (indB > indA || (indB === indA && fracB > fracA)) {
      return indB - indA + fracB - fracA;
    } else {
      //  e.g., 1.25 0.75, 3 meaures -> 1.75 + 0.75
      return numMeasures - (indA + fracA) + fracB + indB;
    }
  }

  firstRelativeNoteTime(): number {
    for (let i = 0; i < this.measures.length; i++) {
      const relTime = this.measures[i].firstRelativeNoteTime();

      if (relTime !== -1) {
        return relTime + i;
      }
    }

    return -1;
  }

  private relativeNoteTimeBeforeOrAfter(t: number, direction: number, allowEqual: boolean): number {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0 || t < 0) {
      return -1;
    }
    
    const measureFloor = Math.floor(t);
    const measureFrac = t - measureFloor;
    const originalMeasureIndex = measureFloor % numMeasures;

    let iters = 0;
    let measIndex = originalMeasureIndex;

    while (iters <= numMeasures) {
      if (measIndex < 0) {
        measIndex = numMeasures - 1;
      } else if (measIndex >= numMeasures) {
        measIndex = 0;
      }

      const meas = this.measures[measIndex];
      let next = -1;
      
      if (iters < numMeasures && measIndex === originalMeasureIndex) {
        next = direction === 1 ? meas.nextRelativeNoteTime(measureFrac, allowEqual) : meas.previousRelativeNoteTime(measureFrac, allowEqual);
      } else {
        next = direction === 1 ? meas.firstRelativeNoteTime() : meas.lastRelativeNoteTime();
      }

      if (next !== -1) {
        return next + measIndex;
      }

      iters++;
      measIndex += direction;
    }

    return -1;
  }

  previousRelativeNoteTime(before: number, allowEqual: boolean = false): number {
    return this.relativeNoteTimeBeforeOrAfter(before, -1, allowEqual);
  }

  nextRelativeNoteTime(after: number, allowEqual: boolean = false): number {
    return this.relativeNoteTimeBeforeOrAfter(after, 1, allowEqual);
  }

  scheduleNoteOnset(relativeTime: number, note: Note): void {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0) {
      return;
    }

    const measureNum = Math.floor(relativeTime);
    const measureIndex = measureNum % numMeasures;
    const measureRelative = relativeTime - measureNum;
    
    this.measures[measureIndex].addNote(measureRelative, note);
  }

  currentMeasureIndex(): number {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0) {
      return -1;
    }

    const measureDuration = this.measures[0].durationSecs(this.scheduler.getBpm());
    const fracMeasure = this.elapsedTime() / measureDuration;
    const floorMeasure = Math.floor(fracMeasure);
    
    return floorMeasure % numMeasures;
  }

  markNoteOnset(note: Note): void {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0 || !this.allowRecord) {
      return;
    }

    const elapsedTime = this.elapsedTime();

    if (elapsedTime < 0) {
      console.error('Internal error: elapsed time < 0.');
      return;
    }

    const measureDuration = this.measures[0].durationSecs(this.scheduler.getBpm());
    const fracMeasure = elapsedTime / measureDuration;
    const floorMeasure = Math.floor(fracMeasure);
    const currMeasure = floorMeasure % numMeasures;
    const relativeTime = fracMeasure - floorMeasure;

    this.measures[currMeasure].addNote(relativeTime, note);
  }

  shallowCopy(): Sequence {
    const b = new Sequence(this.scheduler);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i]);
    }

    b.loop = this.loop;
    b.allowRecord = this.allowRecord;

    return b;
  }

  copy(): Sequence {
    const b = new Sequence(this.scheduler);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i].copy());
    }

    b.loop = this.loop;
    b.allowRecord = this.allowRecord;

    return b;
  }

  private static ID: number = 0;
}

type NoteOn = {
  startTime: number,
  sequenceRelativeTime: number
};

export class SequenceNoteOnListener {
  private scheduler: Scheduler;
  private sequence: Sequence;
  private pending: Array<NoteOn>;
  private note0: NoteOn;
  private note1: NoteOn;
  private noteDistanceSecs: number;
  private lastTime: number;
  private previousStartTime: number;
  private fractionalSequenceTime: number;
  private readonly isNewMethod = true;

  constructor(scheduler: Scheduler, sequence: Sequence) {
    this.scheduler = scheduler;
    this.sequence = sequence;
    this.note0 = {startTime: 0, sequenceRelativeTime: -1};
    this.note1 = {startTime: 0, sequenceRelativeTime: -1};
    this.pending = [];
    this.lastTime = scheduler.currentTime();
    this.previousStartTime = sequence.startTime;
    this.noteDistanceSecs = 0;
    this.fractionalSequenceTime = 0;

    const self = this;

    sequence.addBeforeScheduleTask(seq => {
      self.previousStartTime = seq.startTime;
    });
  }

  private noteOnFunction(startTime: number, sequenceRelativeTime: number): void {
    if (!this.isNewMethod) {
      this.pending.push({startTime, sequenceRelativeTime});
    }
  }

  activeNote(): number {
    return this.note0.sequenceRelativeTime;
  }

  makeNoteOnFunction(pass: NoteOnFunction): NoteOnFunction {
    const self = this;
    
    return (context, note, startTime, noteInd, numNotes, seqRelativeTime) => {
      self.noteOnFunction(startTime, seqRelativeTime);
      const cancelFunc = pass(context, note, startTime, noteInd, numNotes, seqRelativeTime);

      return () => {
        self.pending = [];
        cancelFunc();
      }
    }
  }

  private tSequenceOld(): number {
    const frac = this.sequence.relativeCurrentTime() / this.sequence.numMeasures();

    if (isNaN(frac)) {
      return 0;
    } else {
      return frac;
    }
  }

  tSequence(): number {
    return this.isNewMethod ? this.tSequenceNew() : this.tSequenceOld();
  }

  tNextNote(): number {
    return this.isNewMethod ? this.tNextNoteNew() : this.tNextNoteOld();
  }

  update(): void {
    if (this.isNewMethod) {
      this.updateNew();
    } else {
      this.updateOld();
    }
  }

  private tSequenceNew(): number {
    return this.fractionalSequenceTime;
  }

  private tNextNoteNew(): number {
    const ct = this.scheduler.currentTime();
    const note0 = this.note0.startTime;
    const elapsed = (ct - note0) / this.noteDistanceSecs;

    return isNaN(elapsed) ? 0 : Math.max(0, Math.min(elapsed, 1));
  }

  private updateNew(): void {
    const sequence = this.sequence;
    const ct = this.scheduler.currentTime();

    const measureDuration = sequence.measureDurationSecs();
    const sequenceDuration = sequence.durationSecs();

    if (measureDuration === 0) {
      return;
    }

    const startTime = ct >= sequence.startTime ? sequence.startTime : this.previousStartTime;

    const fracTime = (ct - startTime) / measureDuration;
    const note0 = sequence.previousRelativeNoteTime(fracTime, true);
    const note1 = sequence.nextRelativeNoteTime(note0);
    const noteDist = sequence.relativeNoteDistance(note0, note1);

    let note0Start: number;
    let note0Time = this.scheduler.relativeTimeToSecs(note0);

    note0Start = startTime + note0Time;

    if (note0 > fracTime) {
      note0Start = startTime - (sequenceDuration - note0Time);
    }

    this.note0.sequenceRelativeTime = note0;
    this.note0.startTime = note0Start;
    this.noteDistanceSecs = this.scheduler.relativeTimeToSecs(noteDist);
    this.fractionalSequenceTime = fracTime / sequence.numMeasures();
  }

  private tNextNoteOld(): number {
    const dur = this.note1.startTime - this.note0.startTime;
    let frac = (this.scheduler.currentTime() - this.note0.startTime) / dur;

    if (isNaN(frac) || frac < 0) {
      return 0;
    } else if (frac > 1) {
      return 1;
    } else {
      return frac;
    }
  }

  private updateOld(): void {
    const pend = this.pending;
    const sequence = this.sequence;
    const scheduler = this.scheduler;

    const ct = this.scheduler.currentTime();
    const dt = this.lastTime - ct;
    this.lastTime = ct;

    let note0 = this.note0;
    let note1 = this.note1;
    let offset = 0;
    
    for (let i = 0; i < pend.length; i++) {
      if (ct + dt >= pend[i-offset].startTime) {
        note0 = pend[i-offset];

        const note0RelativeTime = note0.sequenceRelativeTime;
        const note1RelativeTime = sequence.nextRelativeNoteTime(note0RelativeTime);
        const relativeNoteDist = sequence.relativeNoteDistance(note0RelativeTime, note1RelativeTime);
        const note1StartTime = note0.startTime + scheduler.relativeTimeToSecs(relativeNoteDist);

        note1.sequenceRelativeTime = note1RelativeTime;
        note1.startTime = note1StartTime;

        pend.splice(i-offset, 1);
        offset++;
      }
    }

    this.note0 = note0;
    this.note1 = note1;
  }
}
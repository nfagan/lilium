import { Note, NoteOnFunction, Quantization, TimeSignature, copyTimeSignature, NoteCancelFunction } from './types';
import { FrameTimerWithHistory } from '../util';

type ScheduledSequence = {
  sequence: Sequence,
  startTimes: Array<number>,
  sequenceRelativeStarts: Array<number>,
  noteOnFunction: NoteOnFunction,
  cancelFunctions: Array<NoteCancelFunction>,
  startTime: number
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

function alwaysPlayNote(note: Note, t: number): boolean {
  return true;
}

export class Scheduler {
  readonly timeSignature: TimeSignature
  private bpm: number;

  private audioContext: AudioContext;
  private startTime: number;
  private quantization: Quantization;

  private scheduledSequences: Array<ScheduledSequence>;

  private frameTimer: FrameTimerWithHistory;

  constructor(audioContext: AudioContext, timeSignature: TimeSignature, bpm: number, quantization: Quantization) {
    this.audioContext = audioContext;
    this.startTime = audioContext.currentTime;
    this.timeSignature = copyTimeSignature(timeSignature);
    this.bpm = bpm;
    this.quantization = quantization;
    this.scheduledSequences = [];
    this.frameTimer = new FrameTimerWithHistory(20, 10);
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
  }

  subsectionSequence(sequence: Sequence, noteOnFunc: NoteOnFunction, offset: number, numMeasures: number): void {
    const relativeCurrentTime = sequence.relativeCurrentTime();

    if (!sequence.subsection(offset, numMeasures)) {
      return;
    }

    const floorTime = Math.floor(relativeCurrentTime);
    const fracTime = relativeCurrentTime - floorTime;
    const numMeasuresAhead = floorTime - offset;
    const newMeasureIdx = numMeasuresAhead % numMeasures + offset;
    
    const nearestQuantumTime = this.nextQuantumTime() - this.quantumDuration();
    const sequenceRelativeTime = newMeasureIdx + fracTime;
    const currentTime = this.currentTime();

    this.cancelIf(seq => seq.id === sequence.id, (_, startTime) => startTime >= currentTime);
    this.removeIfMatchingSequence(sequence.id);

    this.scheduleSequenceWithNoteCondition(sequence, noteOnFunc, nearestQuantumTime, (note, t) => {
      return t > sequenceRelativeTime;
    });
  }

  clearSequenceSubsection(sequence: Sequence, noteOnFunc: NoteOnFunction): void {
    if (!sequence.isSubsectioned()) {
      return;
    }

    const relativeCurrentTime = sequence.relativeCurrentTime();
    const measureOffset = sequence.getMeasureOffset();

    sequence.clearSubsection();

    const floorTime = Math.floor(relativeCurrentTime);
    const fracTime = relativeCurrentTime - floorTime;
    const measureIndex = (floorTime + measureOffset) % sequence.actualNumMeasures();
    
    const startTime = this.nextQuantumTime() - this.quantumDuration() * (measureIndex + 1);
    const sequenceRelativeTime = measureIndex + fracTime;
    const currentTime = this.currentTime();

    this.cancelIf(seq => seq.id === sequence.id, (_, startTime) => startTime >= currentTime);
    this.removeIfMatchingSequence(sequence.id);

    this.scheduleSequenceWithNoteCondition(sequence, noteOnFunc, startTime, (note, t) => {
      return t > sequenceRelativeTime;
    });
  }

  private updateScheduled(currentTime: number): void {
    let offset = 0;
    const numSequences = this.scheduledSequences.length;

    for (let i = 0; i < numSequences; i++) {
      const seq = this.scheduledSequences[i-offset];
      const sequence = seq.sequence;

      const finishTime = seq.startTime + sequence.subsectionDurationSecs();
      const loopCondition = sequence.loop && currentTime >= finishTime - this.loopLookahead();

      if (currentTime >= finishTime || loopCondition) {
        this.scheduledSequences.splice(i-offset, 1);
        offset++;
      }

      if (loopCondition) {
        this.scheduleSequence(sequence, seq.noteOnFunction);
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
  }

  clearMeasureInSequence(sequence: Sequence, atIdx: number): void {
    sequence.clearMeasure(atIdx);
    this.cancelIfMatchingSequenceIdAndMeasure(sequence.id, atIdx);
  }

  private removeMeasureInSequenceNewUpdate(sequence: Sequence, atIdx: number): void {
    if (sequence.isSubsectioned()) {
      console.warn('Cannot delete while sequence is subsectioned.');
      return;
    }

    const origNumMeasures = sequence.numMeasures();
    const fracTime = sequence.relativeCurrentTime();

    const removeSuccess = sequence.removeMeasure(atIdx);
    if (!removeSuccess) {
      return;
    }

    const numToCancel = origNumMeasures - atIdx;

    for (let i = 0; i < numToCancel; i++) {
      this.cancelIfMatchingSequenceIdAndMeasure(sequence.id, atIdx+i);
    }

    const newNumMeasures = sequence.numMeasures();
    let sequenceToReschedule: Sequence = null;
    let noteOnFunction: NoteOnFunction = null;

    const numScheduled = this.scheduledSequences.length;
    let scheduledOffset = 0;

    for (let i = 0; i < numScheduled; i++) {
      const scheduledSequence = this.scheduledSequences[i-scheduledOffset];

      if (scheduledSequence.sequence.id === sequence.id) {
        sequenceToReschedule = scheduledSequence.sequence;
        noteOnFunction = scheduledSequence.noteOnFunction;
        this.scheduledSequences.splice(i-scheduledOffset, 1);
        scheduledOffset++;
      }
    }

    if (sequenceToReschedule !== null) {
      let origMeasureIdx = Math.floor(fracTime);
      const measFrac = fracTime - origMeasureIdx;
      let newMeasureIdx = origMeasureIdx;

      if (newMeasureIdx >= newNumMeasures) {
        newMeasureIdx = 0;
      }

      const nearestQuantumTime = this.nextQuantumTime() - this.quantumDuration();
      const startTime = nearestQuantumTime - sequence.measureDurationSecs() * newMeasureIdx;
      const sequenceRelativeTime = measFrac + newMeasureIdx;
      
      this.scheduleSequenceWithNoteCondition(sequenceToReschedule, noteOnFunction, startTime, (note, t) => {
        return t > sequenceRelativeTime;
      });
    }
  }

  removeMeasureInSequence(sequence: Sequence, atIdx: number): void {
    this.removeMeasureInSequenceNewUpdate(sequence, atIdx);
  }

  removeIf(sequenceCondition: (seq: Sequence) => boolean): void {
    const numSequences = this.scheduledSequences.length;
    let offset = 0;

    for (let i = 0; i < numSequences; i++) {
      const sequence = this.scheduledSequences[i-offset].sequence;

      if (sequenceCondition(sequence)) {
        this.scheduledSequences.splice(i-offset, 1);
        offset++;
      }
    }
  }

  removeIfMatchingSequence(id: number): void {
    this.removeIf(seq => seq.id === id);
  }

  cancel(): void {
    this.cancelScheduled();
  }

  cancelIfMatchingSequence(id: number): void {
    this.cancelIf(seq => seq.id === id, start => true);
  }

  cancelIfMatchingSequenceIdAndMeasure(id: number, measure: number): void {
    this.cancelIf(seq => seq.id === id, start => Math.floor(start) === measure);
  }

  cancelIf(sequenceCondition: (seq: Sequence) => boolean, noteCondition: (relativeStart: number, startTime: number) => boolean): void {
    for (let i = 0; i < this.scheduledSequences.length; i++) {
      const sequence = this.scheduledSequences[i].sequence;

      if (sequenceCondition(sequence)) {
        const relativeStarts = this.scheduledSequences[i].sequenceRelativeStarts;
        const startTimes = this.scheduledSequences[i].startTimes;
        const cancelFuncs = this.scheduledSequences[i].cancelFunctions;

        for (let j = 0; j < relativeStarts.length; j++) {
          if (noteCondition(relativeStarts[j], startTimes[j])) {
            cancelFuncs[j]();
          }
        }
      }
    }
  }

  update(): void {
    const currentTime = this.currentTime();
    this.frameTimer.update(currentTime);

    this.updateScheduled(currentTime);
  }

  currentTime(): number {
    return this.audioContext.currentTime;
  }

  initialTime(): number {
    return this.startTime;
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

  private scheduleSequenceWithNoteCondition(sequence: Sequence, noteOnFunction: NoteOnFunction, nextStartTime: number, 
    noteCondition: (note: Note, t: number) => boolean): void {
    if (sequence.startTime > this.currentTime()) {
      this.cancelIfMatchingSequence(sequence.id);
    }

    sequence.triggerBeforeScheduleTasks();
    sequence.startTime = nextStartTime;

    let measureOffsetSecs = 0;

    const cancelFunctions: Array<NoteCancelFunction> = [];
    const sequenceRelativeStarts: Array<number> = [];
    const startTimesSecs: Array<number> = [];

    const measures = sequence.getMeasures();
    const measureOffset = sequence.getMeasureOffset();
    const numMeasures = sequence.numMeasures();

    for (let i = 0; i < numMeasures; i++) {
      const measure = measures[i + measureOffset];
      const measureDuration = measure.durationSecs(this.bpm);

      for (let j = 0; j < measure.notes.length; j++) {
        const note = measure.notes[j];
        const noteTime = note.relativeStartTime * measureDuration;
        const startTime = noteTime + nextStartTime + measureOffsetSecs;
        const sequenceRelativeTime = note.relativeStartTime + i + measureOffset;

        if (noteCondition(note, sequenceRelativeTime)) {
          const cancelFunc = noteOnFunction(this.audioContext, note, startTime, sequenceRelativeTime);

          cancelFunctions.push(cancelFunc);
          sequenceRelativeStarts.push(sequenceRelativeTime);
          startTimesSecs.push(startTime);
        }
      }

      measureOffsetSecs += measureDuration;
    }

    this.scheduledSequences.push({
      sequence,
      noteOnFunction,
      cancelFunctions,
      startTimes: startTimesSecs,
      sequenceRelativeStarts,
      startTime: nextStartTime,
      finishTime: nextStartTime + sequence.durationSecs()
    });
  }

  scheduleSequence(sequence: Sequence, noteOnFunction: NoteOnFunction): void {
    this.scheduleSequenceWithNoteCondition(sequence, noteOnFunction, this.nextQuantumTime(), alwaysPlayNote);
  }
}

class Measure {
  readonly timeSignature: TimeSignature;
  notes: Array<ScheduledNote>;

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

  private readonly measures: Array<Measure>;
  readonly id: number;

  loop: boolean;
  allowRecord: boolean;

  onBeforeSchedule: Array<(seq: Sequence) => void>;

  private measureOffset: number;
  private reportedNumMeasures: number;
  private hasSubsection: boolean;

  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler;
    this.startTime = scheduler.initialTime();
    this.measures = [];
    this.id = Sequence.ID++;
    this.loop = false;
    this.allowRecord = true;
    this.onBeforeSchedule = [];
    this.measureOffset = 0;
    this.reportedNumMeasures = 0;
    this.hasSubsection = false;
  }

  getMeasures(): Array<Measure> {
    return this.measures;
  }

  getMeasureOffset(): number {
    return this.measureOffset;
  }

  isSubsectioned(): boolean {
    return this.hasSubsection;
  }

  clearSubsection(): void {
    this.hasSubsection = false;
    this.measureOffset = 0;
    this.reportedNumMeasures = this.actualNumMeasures();
  }

  subsection(offset: number, numMeasures: number): boolean {
    const actualNumMeasures = this.actualNumMeasures();

    if (offset >= 0 && offset < actualNumMeasures && numMeasures >= 0 && numMeasures <= actualNumMeasures) {
      this.measureOffset = offset;
      this.reportedNumMeasures = numMeasures;
      this.hasSubsection = true;
      return true;
    }

    return false;
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
    const numMeasures = this.actualNumMeasures();

    for (let i = 0; i < numMeasures; i++) {
      numNotes += this.measures[i].countNotes();
    }

    return numNotes;
  }

  getRelativeNoteTimes(into: Array<number>): number {
    let index = 0;

    for (let i = 0; i < this.measures.length; i++) {
      const measure = this.measures[i];

      for (let j = 0; j < measure.notes.length; j++) {
        const noteTime = measure.notes[j].relativeStartTime + i;

        if (index < into.length) {
          into[index] = noteTime;
        } else {
          into.push(noteTime)
        }

        index++;
      }
    }

    return index;
  }

  actualNumMeasures(): number {
    return this.measures.length;
  }

  numMeasures(): number {
    return this.hasSubsection ? this.reportedNumMeasures : this.actualNumMeasures();
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

  subsectionDurationSecs(): number {
    return this.measureDurationSecs() * this.numMeasures();
  }

  durationSecs(): number {
    return this.measureDurationSecs() * this.actualNumMeasures();
  }

  clearMeasure(atIdx: number): void {
    if (atIdx < 0 || atIdx >= this.actualNumMeasures()) {
      return;
    }

    this.measures[atIdx].clear();
  }

  clearMeasureAndCancel(atIdx: number): void {
    this.scheduler.clearMeasureInSequence(this, atIdx);
  }

  removeMeasureAndCancel(atIdx: number): void {
    this.scheduler.removeMeasureInSequence(this, atIdx);
  }

  removeMeasure(atIdx: number): boolean {
    if (atIdx < 0 || atIdx >= this.actualNumMeasures()) {
      return false;
    }

    this.measures.splice(atIdx, 1);
    return true;
  }

  addMeasure(): void {
    this.measures.push(new Measure(this.scheduler.timeSignature));
  }

  addMeasures(numMeasures: number): void {
    for (let i = 0; i < numMeasures; i++) {
      this.addMeasure();
    }
  }

  relativeTimeToSecs(relTime: number): number {
    return this.scheduler.relativeTimeToSecs(relTime);
  }

  relativeCurrentTime(): number {
    if (this.actualNumMeasures() === 0) {
      return -1;
    }

    return this.elapsedTime() / this.measureDurationSecs();
  }

  relativeNoteDistanceToNext(t: number): number {
    return this.relativeNoteDistance(t, this.nextRelativeNoteTime(t));
  }

  private measureIndex(a: number): number {
    return Math.floor(a) % this.actualNumMeasures();
  }

  private fraction(a: number): number {
    return a - Math.floor(a);
  }

  relativeNoteDistance(a: number, b: number): number {
    if (this.actualNumMeasures() === 0 || a < 0 || b < 0) {
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
      return this.numMeasures() - (indA + fracA - this.measureOffset) + (fracB + indB - this.measureOffset);
    }
  }

  firstRelativeNoteTime(): number {
    const numMeasures = this.numMeasures();
    const measureOffset = this.measureOffset;

    for (let i = 0; i < numMeasures; i++) {
      const relTime = this.measures[i+measureOffset].firstRelativeNoteTime();

      if (relTime !== -1) {
        return relTime + i + measureOffset;
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
    const actualNumMeasures = this.actualNumMeasures();
    const originalMeasureIndex = measureFloor % actualNumMeasures;

    let iters = 0;
    let measIndex = originalMeasureIndex;

    const measureOffset = this.measureOffset;
    const upperLimit = numMeasures + measureOffset;
    const lowerBound = numMeasures - 1 + measureOffset;

    while (iters <= numMeasures) {
      if (measIndex < measureOffset) {
        measIndex = lowerBound;
      } else if (measIndex >= upperLimit) {
        measIndex = measureOffset;
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
    const numMeasures = this.actualNumMeasures();

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

    const measureDuration = this.measureDurationSecs();
    const fracMeasure = this.elapsedTime() / measureDuration;
    const floorMeasure = Math.floor(fracMeasure);
    
    return floorMeasure % numMeasures + this.measureOffset;
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

    const measureDuration = this.measureDurationSecs();
    const fracMeasure = elapsedTime / measureDuration;
    const floorMeasure = Math.floor(fracMeasure);
    const currMeasure = floorMeasure % numMeasures + this.measureOffset;
    const relativeTime = fracMeasure - floorMeasure;

    this.measures[currMeasure].addNote(relativeTime, note);
  }

  private copyCommonProps(b: Sequence): void {
    b.loop = this.loop;
    b.allowRecord = this.allowRecord;
    b.measureOffset = this.measureOffset;
    b.reportedNumMeasures = this.reportedNumMeasures;
  }

  shallowCopy(): Sequence {
    const b = new Sequence(this.scheduler);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i]);
    }

    this.copyCommonProps(b);
    return b;
  }

  copy(): Sequence {
    const b = new Sequence(this.scheduler);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i].copy());
    }

    this.copyCommonProps(b);
    return b;
  }

  private static ID: number = 0;
}

export class SequenceNoteOnListener {
  private scheduler: Scheduler;
  private sequence: Sequence;
  private noteStartTimeSecs: number;
  private noteStartTimeSequenceRelative: number;
  private noteDistanceSecs: number;
  private previousSequenceStartTime: number;
  private fractionalSequenceTime: number;

  constructor(scheduler: Scheduler, sequence: Sequence) {
    this.scheduler = scheduler;
    this.sequence = sequence;
    this.noteStartTimeSecs = 0;
    this.noteStartTimeSequenceRelative = -1;
    this.previousSequenceStartTime = sequence.startTime;
    this.noteDistanceSecs = 0;
    this.fractionalSequenceTime = 0;

    const self = this;

    sequence.addBeforeScheduleTask(seq => {
      self.previousSequenceStartTime = seq.startTime;
    });
  }

  activeNote(): number {
    return this.noteStartTimeSequenceRelative;
  }

  tSequence(): number {
    return this.fractionalSequenceTime;
  }

  tNextNote(): number {
    const ct = this.scheduler.currentTime();
    const noteStart = this.noteStartTimeSecs;
    const elapsed = (ct - noteStart) / this.noteDistanceSecs;

    return isNaN(elapsed) ? 0 : Math.max(0, Math.min(elapsed, 1));
  }

  update(): void {
    const scheduler = this.scheduler;
    const sequence = this.sequence;
    const ct = this.scheduler.currentTime();

    const measureDuration = sequence.measureDurationSecs();
    const sequenceDuration = sequence.subsectionDurationSecs();

    if (measureDuration === 0) {
      return;
    }

    const measureOffset = sequence.getMeasureOffset();
    const startTime = ct >= sequence.startTime ? sequence.startTime : this.previousSequenceStartTime;

    const fracTime = (ct - startTime) / measureDuration + measureOffset;
    const note0 = sequence.previousRelativeNoteTime(fracTime, true);
    const note1 = sequence.nextRelativeNoteTime(note0);
    const noteDist = scheduler.relativeTimeToSecs(sequence.relativeNoteDistance(note0, note1));

    let note0Time = this.scheduler.relativeTimeToSecs(note0) - measureOffset * measureDuration;
    let note0Start = startTime + note0Time;

    if (note0 > fracTime) {
      note0Start = startTime - (sequenceDuration - note0Time);
    }

    this.noteStartTimeSequenceRelative = note0;
    this.noteStartTimeSecs = note0Start;
    this.noteDistanceSecs = noteDist;
    this.fractionalSequenceTime = Math.max(0, Math.min(fracTime / sequence.actualNumMeasures(), 1));
  }
}
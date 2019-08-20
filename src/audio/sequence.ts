import { Scheduler } from './scheduler';
import { Note, ScheduledNote, NoteOnFunction, TimeSignature, copyTimeSignature } from './types';

function makeScheduledNote(relativeStartTime: number, note: Note): ScheduledNote {
  return {relativeStartTime, ...note};
}

function copyScheduledNote(note: ScheduledNote): ScheduledNote {
  return {...note};
}

export class Measure {
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

  lastRelativeNoteTime(matchingSemitone?: number): number {
    if (this.notes.length === 0) {
      return -1;
    }

    if (matchingSemitone === undefined) {
      return this.notes[this.notes.length-1].relativeStartTime;

    } else {
      for (let i = this.notes.length-1; i >= 0; i--) {
        if (this.notes[i].semitone === matchingSemitone) {
          return this.notes[i].relativeStartTime;
        }
      }
    }

    return -1;
  }

  firstRelativeNoteTime(matchingSemitone?: number): number {
    if (this.notes.length === 0) {
      return -1;
    }

    if (matchingSemitone === undefined) {
      return this.notes[0].relativeStartTime;

    } else {
      for (let i = 0; i < this.notes.length; i++) {
        if (this.notes[i].semitone === matchingSemitone) {
          return this.notes[i].relativeStartTime;
        }
      }
    }

    return -1;
  }

  previousRelativeNoteTime(before: number, allowEqual: boolean = false, matchingSemitone?: number): number {
    for (let i = this.notes.length-1; i >= 0; i--) {
      const relStart = this.notes[i].relativeStartTime;
      const timeCrit = allowEqual ? relStart <= before : relStart < before;
      const semitoneCrit = matchingSemitone === undefined ? true : this.notes[i].semitone === matchingSemitone;

      if (timeCrit && semitoneCrit) {
        return this.notes[i].relativeStartTime;
      }
    }

    return -1;
  }

  nextRelativeNoteTime(after: number, allowEqual: boolean = false, matchingSemitone?: number): number {
    for (let i = 0; i < this.notes.length; i++) {
      const relStart = this.notes[i].relativeStartTime;
      const timeCrit = allowEqual ? relStart >= after : relStart > after;
      const semitoneCrit = matchingSemitone === undefined ? true : this.notes[i].semitone === matchingSemitone;

      if (timeCrit && semitoneCrit) {
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
  noteOnFunction: NoteOnFunction;

  startTime: number;

  private readonly measures: Array<Measure>;
  readonly id: number;

  loop: boolean;
  allowRecord: boolean;

  onBeforeSchedule: Array<(seq: Sequence, nextStartTime: number) => void>;

  private measureOffset: number;
  private reportedNumMeasures: number;
  private hasSubsection: boolean;

  constructor(scheduler: Scheduler, noteOnFunction: NoteOnFunction) {
    this.scheduler = scheduler;
    this.noteOnFunction = noteOnFunction;
    this.startTime = scheduler.initialTime();
    this.measures = [];
    this.id = Sequence.ID++;
    this.loop = false;
    this.allowRecord = false;
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

  triggerBeforeScheduleTasks(nextStartTime: number): void {
    for (let i = 0; i < this.onBeforeSchedule.length; i++) {
      this.onBeforeSchedule[i](this, nextStartTime);
    }
  }

  addBeforeScheduleTask(task: (seq: Sequence, nextStartTime: number) => void): void {
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

  getScheduledNotes(into: Array<ScheduledNote>): number {
    let index = 0;

    for (let i = 0; i < this.measures.length; i++) {
      const measure = this.measures[i];

      for (let j = 0; j < measure.notes.length; j++) {
        const srcNote = measure.notes[j];

        const destNote = copyScheduledNote(srcNote);
        destNote.relativeStartTime = srcNote.relativeStartTime + i;

        if (index < into.length) {
          into[index] = destNote;
        } else {
          into.push(destNote);
        }

        index++;
      }
    }

    return index;
  }

  getStartTime(): number {
    const ct = this.scheduler.currentTime();
    return ct >= this.startTime ? this.startTime : this.startTime - this.subsectionDurationSecs();
  }

  actualNumMeasures(): number {
    return this.measures.length;
  }

  numMeasures(): number {
    return this.hasSubsection ? this.reportedNumMeasures : this.actualNumMeasures();
  }

  subsectionElapsedTime(): number {
    const elapsed = this.scheduler.currentTime() - this.startTime;

    if (elapsed < 0) {
      return elapsed + this.subsectionDurationSecs();
    } else {
      return elapsed;
    }
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

  removeMeasureAndCancel(atIdx: number): boolean {
    return this.scheduler.removeMeasureInSequence(this, atIdx);
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

  boundRelativeTime(relTime: number): number {
    const measure = Math.floor(relTime);
    const frac = relTime - measure;
    const numMinusOffset = (measure - this.measureOffset) % this.numMeasures();
    return numMinusOffset + this.measureOffset + frac;
  }

  relativeTimeToSecs(relTime: number): number {
    return this.scheduler.relativeTimeToSecs(relTime);
  }

  subsectionRelativeCurrentTime(): number {
    if (this.numMeasures() === 0) {
      return -1;
    }

    return this.subsectionElapsedTime() / this.measureDurationSecs() + this.measureOffset;
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

  private relativeNoteTimeBeforeOrAfter(t: number, direction: number, allowEqual: boolean, matchingSemitone: number): number {
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
        next = direction === 1 ? 
          meas.nextRelativeNoteTime(measureFrac, allowEqual, matchingSemitone) : 
          meas.previousRelativeNoteTime(measureFrac, allowEqual, matchingSemitone);
      } else {
        next = direction === 1 ? meas.firstRelativeNoteTime(matchingSemitone) : meas.lastRelativeNoteTime(matchingSemitone);
      }

      if (next !== -1) {
        return next + measIndex;
      }

      iters++;
      measIndex += direction;
    }

    return -1;
  }

  previousRelativeNoteTime(before: number, allowEqual: boolean = false, matchingSemitone?: number): number {
    return this.relativeNoteTimeBeforeOrAfter(before, -1, allowEqual, matchingSemitone);
  }

  nextRelativeNoteTime(after: number, allowEqual: boolean = false, matchingSemitone?: number): number {
    return this.relativeNoteTimeBeforeOrAfter(after, 1, allowEqual, matchingSemitone);
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
    const numMeasures = this.actualNumMeasures();
    return numMeasures === 0 ? -1 : Math.floor(this.subsectionRelativeCurrentTime()) % numMeasures;
  }

  nextMeasureIndex(after: number): number {
    return ((Math.floor(after) - this.measureOffset + 1) % this.numMeasures()) + this.measureOffset;
  }

  markNoteOnset(note: Note): void {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0 || !this.allowRecord) {
      return;
    }

    const relativeTime = this.subsectionRelativeCurrentTime();
    const relativeFrac = relativeTime - Math.floor(relativeTime);
    const currMeasure = Math.floor(relativeTime) % this.actualNumMeasures();

    this.measures[currMeasure].addNote(relativeFrac, note);
  }

  private copyCommonProps(b: Sequence): void {
    b.loop = this.loop;
    b.allowRecord = this.allowRecord;
    b.measureOffset = this.measureOffset;
    b.reportedNumMeasures = this.reportedNumMeasures;
  }

  shallowCopy(): Sequence {
    const b = new Sequence(this.scheduler, this.noteOnFunction);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i]);
    }

    this.copyCommonProps(b);
    return b;
  }

  copy(): Sequence {
    const b = new Sequence(this.scheduler, this.noteOnFunction);

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
    return this.scheduler.isPlaying() ? this.noteStartTimeSequenceRelative : -1;
  }

  tSequence(): number {
    if (this.scheduler.isPlaying() && this.sequence.actualNumMeasures() > 0) {
      return this.fractionalSequenceTime;
    } else {
      return this.sequence.getMeasureOffset() / this.sequence.actualNumMeasures();
    }
  }

  tNextNote(): number {
    if (!this.scheduler.isPlaying()) {
      return 0;
    }

    const ct = this.scheduler.currentTime();
    const noteStart = this.noteStartTimeSecs;
    const elapsed = (ct - noteStart) / this.noteDistanceSecs;

    return isNaN(elapsed) ? 0 : Math.max(0, Math.min(elapsed, 1));
  }

  tNote(note0: number, semitone: number): number {
    if (!this.scheduler.isPlaying()) {
      return 1;
    }

    const rel = this.sequence.subsectionRelativeCurrentTime();
    const numMeasures = this.sequence.actualNumMeasures();

    if (rel > numMeasures) {
      return 1;
    } else if (rel === note0) {
      return 0;
    }

    const note1 = this.sequence.nextRelativeNoteTime(note0, false, semitone);

    if (note1 === -1) {
      return 1;
    }

    const relativeDist = this.sequence.relativeNoteDistance(note0, note1);
    let numerator: number;

    if (rel < note0) {
      if (note1 > note0) {
        return 1;
      } else {
        numerator = rel + numMeasures - note0;
      }
    } else {
      numerator = rel - note0;
    }

    return numerator / relativeDist;
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
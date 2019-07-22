import { Note, NoteOnFunction, Quantization, TimeSignature, copyTimeSignature } from './types';

type LoopingSequence = {
  sequence: Sequence,
  deadlineToSchedule: number,
  noteOnFunction: NoteOnFunction
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

export class Scheduler {
  readonly timeSignature: TimeSignature
  private bpm: number;

  private audioContext: AudioContext;
  private startTime: number;
  private quantization: Quantization;

  private loopingSequences: {[key: number]: LoopingSequence};

  constructor(audioContext: AudioContext, timeSignature: TimeSignature, bpm: number, quantization: Quantization) {
    this.audioContext = audioContext;
    this.startTime = audioContext.currentTime;
    this.timeSignature = copyTimeSignature(timeSignature);
    this.bpm = bpm;
    this.quantization = quantization;
    this.loopingSequences = {};
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
    this.bpm = bpm;
  }

  update(): void {
    const currentTime = this.currentTime();

    for (let seqId in this.loopingSequences) {
      const loopingSequence = this.loopingSequences[seqId];

      if (loopingSequence === undefined) {
        continue;
      }

      const deadline = loopingSequence.deadlineToSchedule;
      const sequence = loopingSequence.sequence;

      if (currentTime >= deadline && sequence.loop) {
        this.scheduleSequence(loopingSequence.sequence, loopingSequence.noteOnFunction);
      }
    }
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
    return 10/60;
  }

  scheduleSequence(sequence: Sequence, noteOnFunction: NoteOnFunction): void {
    const nextStartTime = this.nextQuantumTime();
    const audioContext = this.audioContext;
    let measureOffset = 0;

    if (sequence.startTime > this.currentTime()) {
      //  Already scheduled.
      return;
    }

    sequence.triggerBeforeScheduleTasks();
    sequence.clearBeforeScheduleTasks();
    sequence.startTime = nextStartTime;

    const numNotes = sequence.countNotes();
    let noteIndex = 0;

    for (let i = 0; i < sequence.measures.length; i++) {
      const measure = sequence.measures[i];
      const measureDuration = measure.durationSecs(this.bpm);

      for (let j = 0; j < measure.notes.length; j++) {
        const note = measure.notes[j];
        const noteTime = note.relativeStartTime * measureDuration;
        const startTime = noteTime + nextStartTime + measureOffset;
        const sequenceRelativeTime = note.relativeStartTime + i;

        noteOnFunction(audioContext, note, startTime, noteIndex, numNotes, sequenceRelativeTime);
        noteIndex++;
      }

      measureOffset += measureDuration;
    }

    if (sequence.loop) {
      const deadlineToSchedule = nextStartTime + sequence.durationSecs() - this.loopLookahead();

      this.loopingSequences[sequence.id] = {
        sequence,
        deadlineToSchedule,
        noteOnFunction
      }

    } else if (this.hasLoopingSequence(sequence.id)) {
      this.loopingSequences[sequence.id] = undefined;
    }
  }
}

class Measure {
  readonly timeSignature: TimeSignature;
  readonly notes: Array<ScheduledNote>; //  semitones

  constructor(timeSignature: TimeSignature) {
    this.timeSignature = copyTimeSignature(timeSignature);
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

  firstRelativeNoteTime(): number {
    if (this.notes.length === 0) {
      return -1;
    }

    return this.notes[0].relativeStartTime;
  }

  nextRelativeNoteTime(after: number): number {
    if (this.notes.length === 0) {
      return -1;
    }

    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].relativeStartTime > after) {
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

  durationSecs(): number {
    let duration = 0;

    for (let i = 0; i < this.measures.length; i++) {
      duration += this.measures[i].durationSecs(this.scheduler.getBpm());
    }

    return duration;
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

    return this.elapsedTime() / this.measures[0].durationSecs(this.scheduler.getBpm());
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

  nextRelativeNoteTime(after: number): number {
    const numMeasures = this.numMeasures();

    if (numMeasures === 0 || after < 0) {
      return -1;
    }
    
    const measureFloor = Math.floor(after);
    const measureFrac = after - measureFloor;
    const originalMeasureIndex = measureFloor % numMeasures;

    let measure = this.measures[originalMeasureIndex];
    let relStartThisMeasure = measure.nextRelativeNoteTime(measureFrac);

    if (relStartThisMeasure !== -1) {
      return relStartThisMeasure + originalMeasureIndex;
    }

    let measIndex = originalMeasureIndex + 1;
    let wrappedAround = false;

    while (true) {
      if (measIndex === numMeasures) {
        wrappedAround = true;
        measIndex = 0;
      } else if (wrappedAround && measIndex > originalMeasureIndex) {
        return -1;
      }

      const nextMeasure = this.measures[measIndex];

      if (!nextMeasure.isEmpty()) {
        const firstStart = nextMeasure.firstRelativeNoteTime();
        return firstStart + measIndex;
      }

      measIndex++;
    }
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
      console.error('Elapsed time < 0.');
      return;
    }

    const measureDuration = this.measures[0].durationSecs(this.scheduler.getBpm());
    const fracMeasure = elapsedTime / measureDuration;
    const floorMeasure = Math.floor(fracMeasure);
    const currMeasure = floorMeasure % numMeasures;
    const relativeTime = fracMeasure - floorMeasure;

    this.measures[currMeasure].addNote(relativeTime, note);
  }

  copy(): Sequence {
    const b = new Sequence(this.scheduler);

    for (let i = 0; i < this.measures.length; i++) {
      b.measures.push(this.measures[i].copy());
    }

    b.loop = this.loop;

    return b;
  }

  private static ID: number = 0;
}

export class SequenceNoteOnListener {
  private scheduler: Scheduler;
  private sequence: Sequence;
  private pendingStartTimes: Array<Array<number>>;
  private pendingNote0s: Array<Array<number>>;
  private pendingDistances: Array<Array<number>>;
  private activeIndex: number;
  private lastTime: number;
  private note0: number;
  private note0Time: number;
  private startOffset: number;

  constructor(scheduler: Scheduler, sequence: Sequence) {
    this.scheduler = scheduler;
    this.sequence = sequence;
    this.pendingStartTimes = [];
    this.pendingDistances = [];
    this.pendingNote0s = [];
    this.activeIndex = 0;
    this.lastTime = scheduler.currentTime();
    this.note0 = sequence.firstRelativeNoteTime();
    this.note0Time = scheduler.currentTime();
    this.startOffset = 0;
  }

  private requirePendingArrays(): void {
    if (this.pendingStartTimes[this.activeIndex] === undefined) {
      this.pendingStartTimes[this.activeIndex] = [];
      this.pendingDistances[this.activeIndex] = [];
      this.pendingNote0s[this.activeIndex] = [];
    }
  }

  private removePending(): void {
    this.pendingStartTimes.splice(0, 1);
    this.pendingDistances.splice(0, 1);
    this.pendingNote0s.splice(0, 1);
  }

  private setPending(noteIndex: number, relativeNoteStart: number, startTime: number, noteDistance: number): void {
    this.pendingStartTimes[this.activeIndex][noteIndex] = startTime;
    this.pendingDistances[this.activeIndex][noteIndex] = noteDistance;
    this.pendingNote0s[this.activeIndex][noteIndex] = relativeNoteStart;
  }

  private noteOnFunction(noteIndex: number, numNotes: number, startTime: number, sequenceRelativeTime: number): void {
    const noteDistance = this.scheduler.relativeTimeToSecs(this.sequence.relativeNoteDistanceToNext(sequenceRelativeTime));

    this.requirePendingArrays();
    this.setPending(noteIndex, sequenceRelativeTime, startTime, noteDistance);

    if (noteIndex === numNotes-1) {
      this.activeIndex++;
    }
  }

  makeNoteOnFunction(pass: NoteOnFunction): NoteOnFunction {
    const self = this;

    return (audioContext, note, startTime, noteIndex, numNotes, sequenceRelativeTime) => {
      self.noteOnFunction(noteIndex, numNotes, startTime, sequenceRelativeTime);
      pass(audioContext, note, startTime, noteIndex, numNotes, sequenceRelativeTime);
    };
  }

  tSequence(): number {
    return this.sequence.elapsedTime() / this.sequence.durationSecs();
  }

  tNextNote(): number {
    const note1 = this.sequence.nextRelativeNoteTime(this.note0);

    if (this.note0 === -1 || note1 === -1) {
      return 0;
    } else {
      const noteDistance = this.scheduler.relativeTimeToSecs(this.sequence.relativeNoteDistance(this.note0, note1));
      const elapsedSecs = this.scheduler.currentTime() - this.note0Time;
      return elapsedSecs / noteDistance;
    }
  }

  activeStartTimes(): Array<number> {
    const starts = this.pendingStartTimes;

    if (starts.length === 0) {
      return null;
    }

    return starts[0];
  }

  activeNotes(): Array<number> {
    const note0s = this.pendingNote0s;

    if (note0s.length === 0) {
      return null;
    }

    return note0s[0];
  }

  update(): void {
    const lastTime = this.lastTime;
    const currTime = this.scheduler.currentTime();
    const dt = currTime - lastTime;
    this.lastTime = currTime;

    const pendArrayStarts = this.pendingStartTimes;
    const pendArrayDists = this.pendingDistances;

    let i = 0;
    let pendLength = pendArrayStarts.length;

    while (i < pendLength) {
      const pendStarts = pendArrayStarts[i];
      const pendDists = pendArrayDists[i];
      const numNotes = pendStarts.length;

      let expired = numNotes === 0 || (pendStarts[numNotes-1] + pendDists[numNotes-1]) < currTime;

      if (expired) {
        this.removePending();
        pendLength--;
        this.activeIndex--;
        this.startOffset = 0;
      } else {
        i++;
      }
    }

    if (pendLength > 0) {
      const activeStarts = pendArrayStarts[0];

      for (let i = this.startOffset; i < activeStarts.length; i++) {
        const deadline = activeStarts[i]
        
        if (currTime >= deadline) {
          this.note0 = this.pendingNote0s[0][i];
          this.note0Time = currTime;
          this.startOffset++;
        }
      }
    }
  }
}
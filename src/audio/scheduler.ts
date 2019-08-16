import { Note, NoteOnFunction, Quantization, TimeSignature, copyTimeSignature, NoteCancelFunction } from './types';
import { Sequence } from './sequence';
import { FrameTimerWithHistory, True } from '../util';

type NoteConditionFunction = (note: Note, t: number, startTime: number) => boolean;

type ScheduledSequence = {
  sequence: Sequence,
  startTimes: Array<number>,
  sequenceRelativeStarts: Array<number>,
  cancelFunctions: Array<NoteCancelFunction>,
  startTime: number,
  numScheduledNotes: number,
  elapsedTimeAtPause: number
}

export class Scheduler {
  readonly timeSignature: TimeSignature
  private bpm: number;

  private audioContext: AudioContext;
  private startTime: number;
  private quantization: Quantization;

  private scheduledSequences: Array<ScheduledSequence>;

  private frameTimer: FrameTimerWithHistory;
  private playing: boolean;

  constructor(audioContext: AudioContext, timeSignature: TimeSignature, bpm: number) {
    this.audioContext = audioContext;
    this.startTime = audioContext.currentTime;
    this.timeSignature = copyTimeSignature(timeSignature);
    this.bpm = bpm;
    this.quantization = Quantization.Whole;
    this.scheduledSequences = [];
    this.frameTimer = new FrameTimerWithHistory(20, 10);
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    const ct = this.currentTime();
    this.cancelIf(True, (_0, _1, startTime) => startTime >= ct);
    this.removeAll();
  }

  play(): void {
    const prevState = this.playing;
    this.playing = true;

    if (!prevState) {
      this.startTime = this.currentTime();
    }
  }

  isPlaying(): boolean {
    return this.playing;
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

  shiftBpm(by: number): void {
    this.setBpm(this.getBpm() + by);
  }

  setBpm(bpm: number): void {
    const prevBpm = this.bpm;
    const prevQuantumTime = this.currentQuantumTime();
    const currentTime = this.currentTime();
    const prevQuantumRelative = (currentTime - prevQuantumTime) / this.quantumDuration();

    this.bpm = bpm;

    const quantumDuration = this.quantumDuration();
    const newStartTime = currentTime - quantumDuration * prevQuantumRelative;
    this.startTime = newStartTime;

    const scheduledIds: {[key: number]: number} = {};
    const numScheduled = this.scheduledSequences.length;
    //  Should go here to account for change in start time.
    const currentQuantumTime = this.currentQuantumTime();
    const playing = this.isPlaying();
    let offset = 0;

    for (let i = 0; i < numScheduled; i++) {
      const scheduled = this.scheduledSequences[i-offset];
      const sequence = scheduled.sequence;

      if (playing) {
        this.scheduledSequences.splice(i-offset, 1);
        offset++;
      }
      
      if (scheduledIds[sequence.id] === undefined) {
        for (let j = 0; j < scheduled.cancelFunctions.length; j++) {
          if (scheduled.startTimes[j] >= currentTime) {
            scheduled.cancelFunctions[j]();
          }
        }

        this.bpm = prevBpm;
        const currentMeasureIndex = sequence.currentMeasureIndex() - sequence.getMeasureOffset();
        const relativeCurrTime = sequence.relativeCurrentTime();
        this.bpm = bpm;
        
        const startTime = currentQuantumTime - quantumDuration * currentMeasureIndex;
        
        if (playing) {
          this.scheduleSequenceWithNoteCondition(sequence, startTime, (_, t, start) => {
            return t > relativeCurrTime && start > currentTime;
          });
        }

        scheduledIds[sequence.id] = 1;
      }
    }
  }

  subsectionSequence(sequence: Sequence, offset: number, numMeasures: number): void {
    const relativeCurrentTime = sequence.relativeCurrentTime();

    if (!sequence.subsection(offset, numMeasures)) {
      return;
    }

    const playing = this.isPlaying();

    const floorTime = Math.floor(relativeCurrentTime);
    const fracTime = relativeCurrentTime - floorTime;
    const numMeasuresAhead = floorTime - offset;
    const newMeasureIdx = numMeasuresAhead % numMeasures + offset;
    
    let nearestQuantumTime = this.currentQuantumTime();
    const quantumDuration = this.quantumDuration();
    const nextQuantumTime = nearestQuantumTime + quantumDuration;
    const sequenceRelativeTime = newMeasureIdx + fracTime;
    const currentTime = this.currentTime();
    const loopLookahead = this.loopLookahead();
    let cancelThreshold = currentTime;
    let scheduleThreshold = sequenceRelativeTime;

    if (nextQuantumTime - currentTime < loopLookahead) {
      nearestQuantumTime = nextQuantumTime;
      cancelThreshold = nextQuantumTime;
      scheduleThreshold = offset;
    }

    this.cancelIf(seq => seq.id === sequence.id, (_0, _1, startTime) => startTime >= cancelThreshold);
    this.removeIfMatchingSequence(sequence.id);

    if (playing) {
      this.scheduleSequenceWithNoteCondition(sequence, nearestQuantumTime, (note, t) => {
        return t > scheduleThreshold;
      });
    }
  }

  clearSequenceSubsection(sequence: Sequence): void {
    if (!sequence.isSubsectioned()) {
      return;
    }

    const playing = this.isPlaying();
    const relativeCurrentTime = sequence.relativeCurrentTime();
    const measureOffset = sequence.getMeasureOffset();

    sequence.clearSubsection();

    const floorTime = Math.floor(relativeCurrentTime);
    const fracTime = relativeCurrentTime - floorTime;
    const measureIndex = (floorTime + measureOffset) % sequence.actualNumMeasures();
    
    const startTime = this.currentQuantumTime() - this.quantumDuration() * measureIndex;
    const sequenceRelativeTime = measureIndex + fracTime;
    const currentTime = this.currentTime();

    this.cancelIf(seq => seq.id === sequence.id, (_0, _1, startTime) => startTime >= currentTime);
    this.removeIfMatchingSequence(sequence.id);

    if (playing) {
      this.scheduleSequenceWithNoteCondition(sequence, startTime, (note, t) => {
        return t > sequenceRelativeTime;
      });
    }
  }

  private updateScheduled(currentTime: number): void {
    let offset = 0;
    const numSequences = this.scheduledSequences.length;
    const loopLookahead = this.loopLookahead();
    const nextTime = this.nextQuantumTime();

    for (let i = 0; i < numSequences; i++) {
      const seq = this.scheduledSequences[i-offset];
      const sequence = seq.sequence;

      const finishTime = seq.startTime + sequence.subsectionDurationSecs();
      const loopDeadline = finishTime - loopLookahead;
      const loopCondition = sequence.loop && currentTime >= loopDeadline;

      if (currentTime >= finishTime || loopCondition) {
        this.scheduledSequences.splice(i-offset, 1);
        offset++;
      }

      if (loopCondition) {
        this.scheduleSequence(sequence, nextTime);
      }
    }
  }

  private cancelScheduled(): void {
    for (let i = 0; i < this.scheduledSequences.length; i++) {
      this.cancelAllInScheduledSequence(this.scheduledSequences[i]);
    }
  }

  clearMeasureInSequence(sequence: Sequence, atIdx: number): void {
    sequence.clearMeasure(atIdx);

    const currentTime = this.currentTime();

    this.cancelIf(seq => seq.id === sequence.id, (_, relativeStart, startTime) => {
      return Math.floor(relativeStart) === atIdx && startTime > currentTime;
    });
  }

  removeMeasureInSequence(sequence: Sequence, atIdx: number): boolean {
    if (sequence.isSubsectioned()) {
      console.warn('Cannot delete while sequence is subsectioned.');
      return false;
    }

    //  Report frac time before removing measure.
    const fracTime = sequence.relativeCurrentTime();
    const playing = this.isPlaying();

    const removeSuccess = sequence.removeMeasure(atIdx);
    if (!removeSuccess) {
      return false;
    }

    const currentTime = this.currentTime();
    this.cancelIf(seq => seq.id === sequence.id, (_0, _1, startTime) => startTime > currentTime);

    const newNumMeasures = sequence.numMeasures();
    let sequenceToReschedule: Sequence = null;

    const numScheduled = this.scheduledSequences.length;
    let scheduledOffset = 0;

    for (let i = 0; i < numScheduled; i++) {
      const scheduledSequence = this.scheduledSequences[i-scheduledOffset];

      if (scheduledSequence.sequence.id === sequence.id) {
        sequenceToReschedule = scheduledSequence.sequence;
        this.scheduledSequences.splice(i-scheduledOffset, 1);
        scheduledOffset++;
      }
    }

    if (playing && sequenceToReschedule !== null) {
      let origMeasureIdx = Math.floor(fracTime);
      const measFrac = fracTime - origMeasureIdx;
      const newMeasureIdx = newNumMeasures === 0 ? 0 : origMeasureIdx % newNumMeasures;

      const nearestQuantumTime = this.currentQuantumTime();
      const startTime = nearestQuantumTime - sequence.measureDurationSecs() * newMeasureIdx;
      const sequenceRelativeTime = measFrac + newMeasureIdx;
      
      this.scheduleSequenceWithNoteCondition(sequenceToReschedule, startTime, (note, t) => {
        return t > sequenceRelativeTime;
      });
    }

    return true;
  }

  removeAll(): void {
    this.scheduledSequences = [];
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

  private cancelAllInScheduledSequence(sequence: ScheduledSequence): void {
    for (let i = 0; i < sequence.cancelFunctions.length; i++) {
      sequence.cancelFunctions[i]();
    }
  }

  cancel(): void {
    this.cancelScheduled();
  }

  cancelIfMatchingSequence(id: number): void {
    this.cancelIf(seq => seq.id === id, True);
  }

  cancelIf(sequenceCondition: (seq: Sequence) => boolean, noteCondition: (seq: Sequence, relativeStart: number, startTime: number) => boolean): void {
    for (let i = 0; i < this.scheduledSequences.length; i++) {
      const sequence = this.scheduledSequences[i].sequence;

      if (sequenceCondition(sequence)) {
        const relativeStarts = this.scheduledSequences[i].sequenceRelativeStarts;
        const startTimes = this.scheduledSequences[i].startTimes;
        const cancelFuncs = this.scheduledSequences[i].cancelFunctions;

        for (let j = 0; j < relativeStarts.length; j++) {
          if (noteCondition(sequence, relativeStarts[j], startTimes[j])) {
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
    }
  }

  elapsedTime(): number {
    return this.currentTime() - this.startTime;
  }

  currentQuantumTime(): number {
    const quantumDuration = this.quantumDuration();
    const elapsedTime = this.elapsedTime();
    const currQuantum = Math.floor(elapsedTime / quantumDuration);
    return currQuantum * quantumDuration + this.startTime;
  }

  nextQuantumTime(): number {
    return this.currentQuantumTime() + this.quantumDuration();
  }

  makeSequence(noteOnFunction: NoteOnFunction): Sequence {
    return new Sequence(this, noteOnFunction);
  }

  private loopLookahead(): number {
    const meanDelta = this.frameTimer.meanDelta();

    if (isNaN(meanDelta)) {
      return 10/60;
    } else {
      return meanDelta * 3; //  3 frames
    }
  }

  private scheduleSequenceWithNoteCondition(sequence: Sequence, nextStartTime: number, noteCondition: NoteConditionFunction): void {
    if (sequence.startTime > this.currentTime()) {
      //  Already scheduled -- clear and remove before rescheduling.
      this.cancelIfMatchingSequence(sequence.id);
      this.removeIfMatchingSequence(sequence.id);
    }

    sequence.triggerBeforeScheduleTasks(nextStartTime);
    sequence.startTime = nextStartTime;

    let measureOffsetSecs = 0;

    const cancelFunctions: Array<NoteCancelFunction> = [];
    const sequenceRelativeStarts: Array<number> = [];
    const startTimesSecs: Array<number> = [];

    const noteOnFunction = sequence.noteOnFunction;

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

        if (noteCondition(note, sequenceRelativeTime, startTime)) {
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
      cancelFunctions,
      startTimes: startTimesSecs,
      sequenceRelativeStarts,
      startTime: nextStartTime,
      numScheduledNotes: cancelFunctions.length,
      elapsedTimeAtPause: NaN
    });
  }

  scheduleSequence(sequence: Sequence, when: number): void {
    this.scheduleSequenceWithNoteCondition(sequence, when, True);
  }
}
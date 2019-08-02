import { loadAudioBuffer, asyncTimeout, ObjectToggle } from '../src/util';
import { debug, Keyboard, Keys } from '../src/gl';
import { Scheduler, Sequence, types as audioTypes, SequenceNoteOnListener } from '../src/audio';
import { NoteCancelFunction } from '../src/audio/types';

const keyboard = new Keyboard();

type Sounds = {
  [k: string]: AudioBuffer
  piano: AudioBuffer,
  kick: AudioBuffer
}

function makeAudioContext(): AudioContext {
  return new (window.AudioContext || (<any>window).webkitAudioContext)();
}

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  return {
    piano: await asyncTimeout(() => loadAudioBuffer(audioContext, '/sound/piano_g.mp3'), 5e3),
    kick: await asyncTimeout(() => loadAudioBuffer(audioContext, '/sound/kick.wav'), 5e3)
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

  keyboard.addAnonymousListener(Keys.up, player);
  keyboard.addAnonymousListener(Keys.right, () => soundToggle.cycle());

  return player;
}

function noteOnAudioBuffer(buffer: AudioBuffer): audioTypes.NoteOnFunction {
  return (audioContext, note, startTime) => playAudioBuffer(audioContext, audioContext.destination, buffer, note, startTime);
}

function playAudioBuffer(audioContext: AudioContext, destination: AudioDestinationNode, buffer: AudioBuffer, note: audioTypes.Note, when: number = 0): NoteCancelFunction {
  const semitone = note.semitone;

  const src = audioContext.createBufferSource();

  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, semitone/12);

  src.connect(destination);
  src.start(when);

  return () => src.stop(0);
}

function makeCanvas(appendTo: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
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

  const activeNote = sequenceListener.activeNote();

  const t = sequenceListener.tNextNote();

  const numMeasures = sequence.numMeasures();
  const activeMeasure = sequence.currentMeasureIndex();

  for (let i = 0; i < numMeasures; i++) {
    ctx.strokeStyle = 'black';
    ctx.strokeRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);

    if (i === activeMeasure) {
      // let amt = smoothStep(metronomeListener.tNextNote()) * 20 + 127;
      let amt = 127;

      ctx.fillStyle = `rgb(${amt}, ${amt}, ${amt})`;
      ctx.fillRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);
    }
  }

  const notes = new Array<number>(sequence.countNotes());
  sequence.relativeNoteTimes(notes);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const color = note === activeNote ? (1-t) * 255 : 0;

    ctx.fillStyle = `rgb(${color}, ${color}, ${color})`;
    ctx.fillRect(canvas.width * note / sequence.numMeasures(), 0, w, h);
  }

  const seqW = 10;
  ctx.strokeStyle = 'black';
  const x0 = sequenceListener.tSequence() * canvas.width;
  ctx.strokeRect(x0, 0, seqW, h);
}

export async function main(): Promise<void> {
  debug.maximizeDocumentBody();

  let beganLooping = false;

  const canvas = makeCanvas(document.body);
  const ctx = canvas.getContext('2d');

  const audioContext = makeAudioContext();
  const sounds = await makeSounds(audioContext);
  const bpm = 120;

  const player = pentatonic(audioContext, sounds);

  const scheduler = new Scheduler(audioContext, new audioTypes.TimeSignature(2, 4), bpm, audioTypes.Quantization.Whole);
  const sequence = scheduler.makeSequence();

  const pentScale = pentatonicMaker();

  const metronome = scheduler.makeSequence();
  metronome.addMeasures(2);
  metronome.scheduleNoteOnset(0, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.25, audioTypes.makeNote(-12));
  metronome.scheduleNoteOnset(0.5, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.75, audioTypes.makeNote(10));
  metronome.scheduleNoteOnset(1.5, audioTypes.makeNote(7));

  sequence.addMeasures(1);
  sequence.scheduleNoteOnset(0, audioTypes.makeNote(-12));

  keyboard.addAnonymousListener(Keys.u, () => scheduler.setBpm(scheduler.getBpm() + 2));
  keyboard.addAnonymousListener(Keys.j, () => scheduler.setBpm(scheduler.getBpm() - 2));

  const sequenceListener = new SequenceNoteOnListener(scheduler, sequence);
  const metronomeListener = new SequenceNoteOnListener(scheduler, metronome);

  const noteOnFunc = sequenceListener.makeNoteOnFunction(noteOnAudioBuffer(sounds.piano));
  const metronomeNoteOnFunc = metronomeListener.makeNoteOnFunction(noteOnAudioBuffer(sounds.piano));

  keyboard.addAnonymousListener(Keys.n, () => sequence.addMeasure());
  keyboard.addAnonymousListener(Keys.d, () => {
    const measIndex = sequence.currentMeasureIndex();
    sequence.removeMeasure(measIndex);
    scheduler.cancelIfMatchingSequenceIdAndMeasure(sequence.id, measIndex);
  });
  
  keyboard.addAnonymousListener(Keys.c, () => {
    const measIndex = sequence.currentMeasureIndex();
    sequence.clearMeasure(measIndex);
    scheduler.cancelIfMatchingSequenceIdAndMeasure(sequence.id, measIndex);
  });

  const beginLoop = () => {
    sequence.loop = true;
    sequence.allowRecord = true;
    metronome.loop = true;

    scheduler.scheduleSequence(sequence, noteOnFunc);
    scheduler.scheduleSequence(metronome, metronomeNoteOnFunc);
  }

  keyboard.addAnonymousListener(Keys.left, beginLoop);

  keyboard.addAnonymousListener(Keys.down, () => {
    sequence.loop = false;
    metronome.loop = false;
    sequence.allowRecord = false;
    scheduler.cancel();
  });

  const recorder = () => {
    const note = audioTypes.makeNote(pentScale());
    sequence.markNoteOnset(note);
    playAudioBuffer(audioContext, audioContext.destination, sounds.piano, note);
  }

  document.body.addEventListener('mousedown', _ => player());
  keyboard.addAnonymousListener(Keys.space, recorder);

  document.body.addEventListener('touchstart', e => {
    if (!beganLooping) {
      beginLoop();
      beganLooping = true;
    }

    for (let i = 0; i < e.touches.length; i++) {
      recorder();
    }
  });

  const updater = () => {
    scheduler.update();
    sequenceListener.update();
    metronomeListener.update();

    drawSequence(ctx, sequenceListener, sequence, scheduler, metronomeListener);

    window.requestAnimationFrame(updater);
  }

  window.requestAnimationFrame(updater);
}
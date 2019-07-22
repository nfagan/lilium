import { loadAudioBuffer, asyncTimeout, ObjectToggle } from '../src/util';
import { debug, Keyboard, Keys } from '../src/gl';
import { Scheduler, Sequence, types as audioTypes, SequenceNoteOnListener } from '../src/audio';

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

function storeNoteTimesAndPlay(noteTimes: Array<number>, sequenceTimes: Array<number>, buffer: AudioBuffer): audioTypes.NoteOnFunction {
  return (audioContext, note, startTime, noteIndex, numNotes, sequenceRelativeTime) => {
    noteTimes[noteIndex] = startTime;
    sequenceTimes[noteIndex] = sequenceRelativeTime;

    playAudioBuffer(audioContext, audioContext.destination, buffer, note, startTime);
  }
}

function noteOnAudioBuffer(buffer: AudioBuffer): audioTypes.NoteOnFunction {
  return (audioContext, note, startTime) => playAudioBuffer(audioContext, audioContext.destination, buffer, note, startTime);
}

function playAudioBuffer(audioContext: AudioContext, destination: AudioDestinationNode, buffer: AudioBuffer, note: audioTypes.Note, when: number = 0): void {
  const src = audioContext.createBufferSource();
  const semitone = note.semitone;

  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, semitone/12);

  src.connect(destination);
  src.start(when);
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
  const w = 20;
  const h = 500;

  clearCanvas(ctx);
  const canvas = ctx.canvas;

  const activeNotes = sequenceListener.activeNotes();
  const activeStarts = sequenceListener.activeStartTimes();

  if (activeNotes === null) {
    return;
  }

  const t = smoothStep(sequenceListener.tNextNote());

  const numMeasures = sequence.numMeasures();
  const activeMeasure = sequence.currentMeasureIndex();

  for (let i = 0; i < numMeasures; i++) {
    ctx.strokeStyle = 'black';
    ctx.strokeRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);

    if (i === activeMeasure) {
      let amt = smoothStep(metronomeListener.tNextNote()) * 20 + 127;

      ctx.fillStyle = `rgb(${amt}, ${amt}, ${amt})`;
      ctx.fillRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);
    }
  }

  for (let i = 0; i < activeNotes.length; i++) {
    if (scheduler.currentTime() >= activeStarts[i] + 1/60) {
      ctx.fillStyle = `rgb(255, 0, ${(1-t) * 255})`;
      ctx.fillRect(canvas.width * activeNotes[i] / sequence.numMeasures(), 0, w, h);
    }
  }
}

// function drawSequence(ctx: CanvasRenderingContext2D, sequenceListener: SequenceNoteOnListener, sequence: Sequence): void {
//   let y = 0;
//   const w = 20;
//   const h = 20;

//   let t = sequenceListener.tNextNote();
//   t = t * t * (3.0 - 2.0 * t);

//   const currMeasure = sequence.currentMeasureIndex();

//   for (let i = 0; i < sequence.measures.length; i++) {
//     ctx.fillStyle = `rgb(255, 0, ${(1-t) * 255})`;
//     ctx.fillRect(0, y, w, h);

//     if (i === currMeasure) {
//       ctx.fillStyle = `rgb(255, 0, ${(t) * 255})`;
//       ctx.fillRect(w/2 - w/8, h/2-h/8, w/4, h/4);
//     }

//     y += h;
//   }  
// }

export async function main(): Promise<void> {
  //  a) 2 beats per voxel (80-85 bpm by default)

  debug.maximizeDocumentBody();

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
  metronome.addMeasure();
  metronome.scheduleNoteOnset(0, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.25, audioTypes.makeNote(-12));
  metronome.scheduleNoteOnset(0.5, audioTypes.makeNote(0));
  metronome.scheduleNoteOnset(0.75, audioTypes.makeNote(10));
  metronome.loop = true;

  sequence.addMeasures(1);
  sequence.scheduleNoteOnset(0, audioTypes.makeNote(-12));
  // sequence.scheduleNoteOnset(0, audioTypes.makeNote(pentScale()));
  // sequence.scheduleNoteOnset(0, audioTypes.makeNote(pentScale()));
  // sequence.scheduleNoteOnset(0, audioTypes.makeNote(pentScale()));
  // sequence.scheduleNoteOnset(0.5, audioTypes.makeNote(pentScale()));
  // sequence.scheduleNoteOnset(0.25, audioTypes.makeNote(pentScale()));
  // sequence.scheduleNoteOnset(0.5, audioTypes.makeNote(pentScale()));

  keyboard.addAnonymousListener(Keys.u, () => {
    scheduler.setBpm(scheduler.getBpm() + 1);
  });

  const noteTimes: Array<number> = [];
  const sequenceTimes: Array<number> = [];
  const sequenceLifecycle = new SequenceNoteOnListener(scheduler, sequence);
  const metronomeLifecycle = new SequenceNoteOnListener(scheduler, metronome);

  const noteOnFunc = sequenceLifecycle.makeNoteOnFunction(storeNoteTimesAndPlay(noteTimes, sequenceTimes, sounds.piano));
  const metronomeNoteOnFunc = metronomeLifecycle.makeNoteOnFunction(noteOnAudioBuffer(sounds.piano));

  keyboard.addAnonymousListener(Keys.n, () => {
    sequence.addMeasure();
  });

  keyboard.addAnonymousListener(Keys.left, () => {
    sequence.loop = true;
    sequence.allowRecord = true;
    metronome.loop = true;

    scheduler.scheduleSequence(sequence, noteOnFunc);
    scheduler.scheduleSequence(metronome, metronomeNoteOnFunc);
  });

  keyboard.addAnonymousListener(Keys.down, () => {
    sequence.loop = false;
    metronome.loop = false;
    sequence.allowRecord = false;
  });

  document.body.addEventListener('touchstart', e => {
    for (let i = 0; i < e.touches.length; i++) {
      player();
    }
  });

  document.body.addEventListener('mousedown', _ => player());
  keyboard.addAnonymousListener(Keys.space, () => {
    const note = audioTypes.makeNote(pentScale());
    playAudioBuffer(audioContext, audioContext.destination, sounds.piano, note);
    sequence.markNoteOnset(note);
  });

  const updater = () => {
    scheduler.update();
    sequenceLifecycle.update();
    metronomeLifecycle.update();

    drawSequence(ctx, sequenceLifecycle, sequence, scheduler, metronomeLifecycle);

    window.requestAnimationFrame(updater);
  }

  window.requestAnimationFrame(updater);
}
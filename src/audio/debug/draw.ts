import { ScheduledNote } from '../types';
import { Sequence, SequenceNoteOnListener } from '../sequence';
import { Scheduler } from '../scheduler';
import { Automation } from '../automation';

function clearCanvas(ctx: CanvasRenderingContext2D): void {
  const canvas = ctx.canvas;
  const boundRect = canvas.getBoundingClientRect();
  canvas.width = boundRect.width * (window.devicePixelRatio || 1);
  canvas.height = boundRect.height * (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawSequence(ctx: CanvasRenderingContext2D, sequence: Sequence, sequenceListener: SequenceNoteOnListener): void {
  clearCanvas(ctx);
  
  const canvas = ctx.canvas;
  const w = 20;
  const h = canvas.height;

  ctx.globalAlpha = 1;

  const numMeasures = sequence.actualNumMeasures();
  const measOffset = sequence.getMeasureOffset();
  const subsectionMeasures = sequence.numMeasures();

  for (let i = 0; i < numMeasures; i++) {
    ctx.strokeStyle = 'black';
    ctx.strokeRect(i / numMeasures * canvas.width, 0, 1/numMeasures * canvas.width, h);
  }

  const minNote = -12;
  const maxNote = 24;
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

export function drawAutomation(ctx: CanvasRenderingContext2D, scheduler: Scheduler, automation: Automation, listener: SequenceNoteOnListener): void {
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
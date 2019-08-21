import * as wgl from '../src/gl';
import { PlayerMovement, Player, GrassTile, 
  GrassModelOptions, GrassTextureOptions, GrassComponent, GrassResources, 
  AirParticles, AirParticleResources, PlayerMoveControls, Controller, input, ImageQualityManager, ImageQuality, getDpr, FatalError, WorldGridDrawable, 
  WorldGridComponent, SkyDomeDrawable, SkyDomeResources, AirParticleOptions, WorldGridManipulator, PlayerDrawable, 
  PlayerDrawableResources, gameUtil, wasm } from '../src/game';
import { Stopwatch, IStopWatch, tryExtractErrorMessage, asyncTimeout, loadAudioBuffer } from '../src/util';
import { mat4, vec3, mat3 } from 'gl-matrix';
import * as audio from '../src/audio';

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

function drawSequence(ctx: CanvasRenderingContext2D, sequenceListener: audio.SequenceNoteOnListener, sequence: audio.Sequence, minNote: number, maxNote: number): void {
  const canvas = ctx.canvas;
  const w = 2;
  const h = canvas.height;

  ctx.globalAlpha = 1;

  const activeNote = sequenceListener.activeNote();
  const t = sequenceListener.tNextNote();
  const numMeasures = sequence.actualNumMeasures();
  const measOffset = sequence.getMeasureOffset();
  const subsectionMeasures = sequence.numMeasures();
  const noteSpan = maxNote - minNote + 1;

  const notes: Array<audio.types.ScheduledNote> = [];
  sequence.getScheduledNotes(notes);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    const yAmt = Math.max(0, Math.min((note.semitone - minNote) / noteSpan, 1));
    const h = canvas.height * (1 / noteSpan);
    const y = yAmt * canvas.height;

    const relStart = note.relativeStartTime;
    const measNote = Math.floor(relStart);
    const color = relStart === activeNote ? (1-t) * 255 : 0;
    const isWithinSubsection = (measNote < measOffset || measNote >= subsectionMeasures + measOffset);
    const subsectionAlpha = isWithinSubsection ? 0.25 : 1.0;

    ctx.fillStyle = `rgb(${color}, ${255}, ${255})`;
    ctx.globalAlpha = subsectionAlpha;
    ctx.fillRect(canvas.width * relStart / numMeasures, y, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = sequence.isSubsectioned() ? 'green' : 'red';
  const x0 = sequenceListener.tSequence() * canvas.width;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, h);
  ctx.stroke();
}

class SequenceModel {
  private renderContext: wgl.RenderContext;
  private renderer: wgl.Renderer;
  private model: wgl.Model;
  private mousePicker: wgl.MousePicker;
  private mouseRayDirection = [0, 0, 0];

  private scale = [4, 2, 0.01];
  private xRotation = 0;
  private zRotation = 0;
  // private translation = [0, 1, 5];
  private position = [0, 0, 0];
  private translation = [17.5, 7, 35];

  private textureData: Uint8Array;
  private texture: wgl.Texture2D;
  private textureSize = 128;

  private canvas: HTMLCanvasElement;
  private canvasContext: CanvasRenderingContext2D;

  private sequence: audio.Sequence;
  private sequenceListener: audio.SequenceNoteOnListener;

  private minSemitone = -12;
  private maxSemitone = 12;
  private drawGridLines = false;

  private intersectModel: wgl.Model;

  constructor(renderContext: wgl.RenderContext, renderer: wgl.Renderer, mousePicker: wgl.MousePicker,
    sequence: audio.Sequence, sequenceListener: audio.SequenceNoteOnListener) {
    this.renderContext = renderContext;
    this.renderer = renderer;
    this.model = null;
    this.mousePicker = mousePicker;

    this.textureData = new Uint8Array(this.textureSize * this.textureSize * 4);
    this.texture = wgl.Texture2D.linearRepeatRGBA(renderContext.gl);
    this.texture.wrapS = renderContext.gl.CLAMP_TO_EDGE;
    this.texture.wrapT = renderContext.gl.CLAMP_TO_EDGE;

    this.sequence = sequence;
    this.sequenceListener = sequenceListener;

    this.makeCanvas();
  }

  private makeCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.textureSize;
    this.canvas.height = this.textureSize;
    this.canvasContext = this.canvas.getContext('2d');
    this.canvas.style.width = `${this.canvas.width / (window.devicePixelRatio || 1)}px`;
    this.canvas.style.height = `${this.canvas.height / (window.devicePixelRatio || 1)}px`;
  }

  private drawToCanvas(intersectCell: Array<number>): void {
    const ctx = this.canvasContext;
    const canvas = this.canvas;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;

    const semitoneSpan = this.maxSemitone - this.minSemitone;
    const numMeasures = this.sequence.actualNumMeasures();

    if (this.drawGridLines) {
      for (let i = 0; i < semitoneSpan; i++) {
        const y = i / semitoneSpan * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      for (let i = 0; i < numMeasures; i++) {
        const x = i / numMeasures * canvas.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
    }

    if (intersectCell[0] !== -1) {
      const minX = intersectCell[0] / numMeasures * canvas.width;
      const minY = intersectCell[1] / semitoneSpan * canvas.height;
      const w = 1 / numMeasures * canvas.width;
      const h = 1 / semitoneSpan * canvas.height;

      ctx.fillStyle = `rgb(255, 255, 127)`;
      ctx.fillRect(minX, minY, w, h);
    }

    drawSequence(ctx, this.sequenceListener, this.sequence, this.minSemitone, this.maxSemitone);
  }

  private fillTextureData(): void {
    const pushed = this.renderContext.pushActiveTexture2DAndBind(this.texture);
    const imgData = this.canvasContext.getImageData(0, 0, this.canvas.width, this.canvas.height);

    this.textureData.set(imgData.data);
    this.texture.subImage(this.textureData);

    if (pushed) {
      this.renderContext.popTexture2D();
    }
  }

  private getPlaneNormal(): vec3 {
    const norm = vec3.create();
    norm[2] = -1;
    const mat = mat3.fromMat4(mat3.create(), this.model.transform.matrix);
    mat3.invert(mat3.transpose(mat, mat), mat);
    vec3.transformMat3(norm, norm, mat);
    vec3.normalize(norm, norm);
    return norm;
  }

  private intersectingSequenceCell(intersectPt: wgl.types.Real3, modelMat: mat4): Array<number> {
    const semitoneSpan = this.maxSemitone - this.minSemitone;
    const measureSpan = this.sequence.actualNumMeasures();
    const testPoint1 = vec3.create();
    const testPoint2 = vec3.create();
    const cellIdx = [-1, -1];

    const ix = intersectPt[0];
    const iy = intersectPt[1];
    const iz = intersectPt[2];

    for (let i = 0; i < semitoneSpan; i++) {
      for (let j = 0; j < measureSpan; j++) {
        testPoint1[0] = (j / measureSpan * 2) - 1;
        testPoint1[1] = (i / semitoneSpan * 2) - 1;
        testPoint1[2] = 0;

        testPoint2[0] = ((j+1) / measureSpan * 2) - 1;
        testPoint2[1] = ((i+1) / semitoneSpan * 2) - 1;
        testPoint2[2] = 0;

        vec3.transformMat4(testPoint1, testPoint1, modelMat);
        vec3.transformMat4(testPoint2, testPoint2, modelMat);

        let minX = testPoint1[0];
        let minY = testPoint1[1];
        let minZ = testPoint1[2];

        let maxX = testPoint2[0];
        let maxY = testPoint2[1];
        let maxZ = testPoint2[2];

        if (minX > maxX) {
          minX = testPoint2[0];
          maxX = testPoint1[0];
        }

        if (minY > maxY) {
          minY = testPoint2[1];
          maxY = testPoint1[1];
        }

        if (minZ > maxZ) {
          minZ = testPoint2[2];
          maxZ = testPoint1[2];
        }

        const xCrit = ix >= minX && ix <= maxX;
        const yCrit = iy >= minY && iy <= maxY;
        const zCrit = (iz >= minZ && iz <= maxZ) || minZ === maxZ;

        if (xCrit && yCrit && zCrit) {
          cellIdx[0] = j;
          cellIdx[1] = i;

          return cellIdx;
        }
      }
    }

    return cellIdx;
  }

  update(playerAabb: wgl.math.Aabb, x: number, y: number, w: number, h: number, view: mat4, proj: mat4, camPos: vec3): void {
    this.mousePicker.ray(this.mouseRayDirection, x, y, view, proj, w, h);

    // this.position[0] = playerAabb.midX() + this.translation[0];
    // this.position[1] = playerAabb.maxY + this.translation[1];
    // this.position[2] = playerAabb.maxZ + this.translation[2];

    this.position[0] = this.translation[0];
    this.position[1] = this.translation[1];
    this.position[2] = this.translation[2];

    const model = this.model;
    model.transform.identity();
    model.transform.translate(this.position);
    mat4.rotateZ(model.transform.matrix, model.transform.matrix, this.zRotation);
    mat4.rotateX(model.transform.matrix, model.transform.matrix, this.xRotation);
    model.transform.scale(this.scale);

    const intersectPt = vec3.create();
    const rayDir = vec3.copy(vec3.create(), this.mouseRayDirection);
    const pos = vec3.copy(vec3.create(), this.position);
    const planeNormal = this.getPlaneNormal();
    const intersectResult = wgl.intersect.rayIntersectsPlane(intersectPt, camPos, rayDir, planeNormal, pos);
    let intersectCell = [-1, -1];

    if (intersectResult.intersects) {
      const intersectModel = this.intersectModel;

      intersectModel.transform.identity();
      intersectModel.transform.translate(intersectPt);
      intersectModel.transform.scale(0.1);

      intersectCell = this.intersectingSequenceCell(intersectPt, model.transform.matrix);
    }

    this.drawToCanvas(intersectCell);
    this.fillTextureData();
  }

  addToScene(scene: wgl.Scene): void {
    scene.addModel(this.model);
    // scene.addModel(this.intersectModel);
  }

  private makeCubeGeometry(prog: wgl.Program): {vao: wgl.Vao, numIndices: number} {
    const cubeIndices = wgl.geometry.cubeIndices();
    const cubeData = wgl.geometry.cubeInterleavedPositionsUvs();
    const attrs = [wgl.types.BuiltinAttribute.Position, wgl.types.BuiltinAttribute.Uv];

    return {
      vao: wgl.Vao.fromSimpleInterleavedFloatData(this.renderContext.gl, prog, cubeData, attrs, cubeIndices),
      numIndices: cubeIndices.length
    };
  }

  create(): void {
    const renderContext = this.renderContext;
    const renderer = this.renderer;

    this.renderContext.pushActiveTexture2DAndBind(this.texture);
    this.texture.width = this.textureSize;
    this.texture.height = this.textureSize;
    this.texture.configure();
    this.texture.fillImage(this.textureData);
    this.renderContext.popTexture2D();

    const mat = wgl.Material.NoLight();
    mat.setUniformProperty('modelColor', this.texture);

    const prog = renderer.requireProgram(mat);
    const vaoResult = this.makeCubeGeometry(prog);
    const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);

    const model = new wgl.Model(drawable, mat);

    const intersectMat = wgl.Material.NoLight();
    const intersectProg = renderer.requireProgram(intersectMat);
    const intersectVaoResult = wgl.factory.vao.makeCubeVao(renderContext.gl, intersectProg);
    intersectMat.setUniformProperty('modelColor', [0, 1, 0]);
    const intersectDrawable = wgl.types.Drawable.indexed(renderContext, intersectVaoResult.vao, intersectVaoResult.numIndices);
    const intersectModel = new wgl.Model(intersectDrawable, intersectMat);

    this.model = model;
    this.intersectModel = intersectModel;
  }
}

const IS_FULLSCREEN = false;

type Sounds = {
  piano: AudioBuffer,
  hat: AudioBuffer
}

const enum GridManipulationState {
  Selecting,
  Adding,
  NotManipulating
};

type Game = {
  mousePicker: wgl.MousePicker,
  sequenceModel: SequenceModel,
  gridManipulationState: GridManipulationState,
  gridManipulator: WorldGridManipulator,
  mouse: wgl.debug.DebugMouseState,
  keyboard: wgl.Keyboard,
  airParticleComponent: AirParticles,
  grassComponent: GrassComponent,
  playerDrawable: PlayerDrawable,
  playerLight: wgl.Light,
  playerMovement: PlayerMovement,
  controller: Controller,
  moveControls: PlayerMoveControls,
  worldGrid: WorldGridComponent,
  player: Player,
  frameTimer: IStopWatch,
  sunPosition: Array<number>,
  sunColor: Array<number>,
  airParticleOptions: AirParticleOptions,
  grassTileOptions: GrassTile,
  grassModelOptions: GrassModelOptions,
  grassTextureOptions: GrassTextureOptions,
  imageQualityManager: ImageQualityManager,
  scene: wgl.Scene,
  sequenceAggregate: SequenceAggregate
};

const GAME: Game = {
  mousePicker: new wgl.MousePicker(),
  sequenceModel: null,
  gridManipulationState: GridManipulationState.NotManipulating,
  gridManipulator: null,
  mouse: wgl.debug.makeDebugMouseState(),
  keyboard: new wgl.Keyboard(),
  airParticleComponent: null,
  playerDrawable: null,
  playerLight: null,
  grassComponent: null,
  playerMovement: null,
  controller: null,
  moveControls: null,
  worldGrid: null,
  player: null,
  frameTimer: null,
  sunPosition: [50, 20, 50],
  sunColor: [1, 1, 1],
  airParticleOptions: {
    numParticles: 1000, 
    particleGridScale: 10,
    particleScale: 0.0075
  },
  grassTileOptions: {
    density: 0.1,
    dimension: 300,
    offsetX: 2,
    offsetY: 0,
    offsetZ: 2
  },
  grassModelOptions: {numSegments: 3},
  grassTextureOptions: {textureSize: 256, tryUseWasm: true},
  imageQualityManager: new ImageQualityManager(ImageQuality.Medium),
  scene: new wgl.Scene(),
  sequenceAggregate: null
};

type SequenceAggregate = {
  scheduler: audio.Scheduler,
  sequence: audio.Sequence,
  sequenceListener: audio.SequenceNoteOnListener,
  metronome: audio.Sequence
}

function makeSequenceAggregate(sounds: Sounds, audioContext: AudioContext, keyboard: wgl.Keyboard): SequenceAggregate {
  const bpm = 125;

  const noteOnPiano = noteOnAudioBuffer(sounds.piano);
  const noteOnKick = noteOnAudioBuffer(sounds.hat);

  const scheduler = new audio.Scheduler(audioContext, new audio.types.TimeSignature(2, 4), bpm);
  const sequence = scheduler.makeSequence(noteOnPiano);
  const metronome = scheduler.makeSequence(noteOnKick);

  sequence.addMeasures(2);
  sequence.scheduleNoteOnset(0, audio.types.makeNote(-12));
  sequence.scheduleNoteOnset(1, audio.types.makeNote(12));
  sequence.loop = true;

  metronome.addMeasure();
  metronome.scheduleNoteOnset(0, audio.types.makeNote(0));
  metronome.scheduleNoteOnset(0.25, audio.types.makeNote(1));
  metronome.scheduleNoteOnset(0.5, audio.types.makeNote(-12));
  metronome.scheduleNoteOnset(0.5, audio.types.makeNote(1));
  metronome.scheduleNoteOnset(0.75, audio.types.makeNote(0));
  // metronome.scheduleNoteOnset(0.75 + 0.25/2, audio.types.makeNote(0));
  metronome.loop = true;

  const sequenceListener = new audio.SequenceNoteOnListener(scheduler, sequence);

  const pentScale = pentatonicMaker();
  const recorder = () => {
    const note = audio.types.makeNote(pentScale());
    sequence.markNoteOnset(note);
    playAudioBuffer(audioContext, audioContext.destination, sounds.piano, note);
  }

  const play = () => {
    if (!scheduler.isPlaying()) {
      scheduler.play();
      scheduler.scheduleSequence(sequence, scheduler.currentQuantumTime());
      scheduler.scheduleSequence(metronome, scheduler.currentQuantumTime());
      sequence.allowRecord = true;
    }
  }

  keyboard.addAnonymousListener(wgl.Keys.n, () => sequence.addMeasure());
  keyboard.addAnonymousListener(wgl.Keys.down, () => {
    scheduler.stop();
    sequence.allowRecord = false;
  });
  keyboard.addAnonymousListener(wgl.Keys.right, play);
  keyboard.addAnonymousListener(wgl.Keys.e, recorder);
  keyboard.addAnonymousListener(wgl.Keys.c, () => sequence.clearMeasureAndCancel(sequence.currentMeasureIndex()));
  keyboard.addAnonymousListener(wgl.Keys.r, () => sequence.removeMeasureAndCancel(sequence.currentMeasureIndex()));
  keyboard.addAnonymousListener(wgl.Keys.q, () => {
    if (sequence.isSubsectioned()) {
      scheduler.clearSequenceSubsection(sequence);
    } else {
      scheduler.subsectionSequence(sequence, sequence.currentMeasureIndex(), 1)
    }
  });
  keyboard.addAnonymousListener(wgl.Keys.u, () => scheduler.shiftBpm(5));
  keyboard.addAnonymousListener(wgl.Keys.j, () => scheduler.shiftBpm(-5));

  document.body.addEventListener('touchstart', e => {
    play();
  });

  return {
    scheduler,
    sequence,
    sequenceListener,
    metronome
  }
}

function noteOnAudioBuffer(buffer: AudioBuffer): audio.types.NoteOnFunction {
  return (audioContext, note, startTime, seqTime) => playAudioBuffer(audioContext, audioContext.destination, buffer, note, startTime);
}

function playAudioBuffer(audioContext: AudioContext, destination: AudioDestinationNode, buffer: AudioBuffer, note: audio.types.Note, when: number = 0): audio.types.NoteCancelFunction {
  const semitone = note.semitone;

  const src = audioContext.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, semitone/12);

  let stopped = false;

  src.connect(destination);
  src.start(when);
  src.onended = () => stopped = true;

  return () => {
    if (!stopped) {
      src.stop(0);
      stopped = true;
    }
  }
}

async function makeSounds(audioContext: AudioContext): Promise<Sounds> {
  return {
    piano: await asyncTimeout(() => loadAudioBuffer(audioContext, '/sound/kick.wav'), 5e3),
    hat: await asyncTimeout(() => loadAudioBuffer(audioContext, '/sound/hat.wav'), 5e3),
  }
}

function makeWorldGrid(renderContext: wgl.RenderContext): WorldGridComponent {
  const gridDim = 35;
  const cellDims = [2, 0.5, 2];
  const maxNumInstances = gridDim * gridDim * 2;

  const grid = new wgl.VoxelGrid([0, 0, 0], [gridDim, gridDim, gridDim], cellDims);
  const floorDim = Math.floor(gridDim/2);

  const worldGridDrawable = new WorldGridDrawable(grid, renderContext, maxNumInstances);
  worldGridDrawable.create();

  const gridComponent = new WorldGridComponent(grid, worldGridDrawable, maxNumInstances);
  gridComponent.fillGround(floorDim, floorDim);

  const dim = GAME.grassTileOptions.density * GAME.grassTileOptions.dimension;
  const offX = GAME.grassTileOptions.offsetX;
  const offZ = GAME.grassTileOptions.offsetZ;
  gridComponent.encloseSquare(dim, offX, offZ, 2);

  return gridComponent;
}

function makeLightModel(renderer: wgl.Renderer, renderContext: wgl.RenderContext, lightPos: wgl.types.Real3, lightColor: wgl.types.Real3): wgl.Model {
  const gl = renderContext.gl;

  const mat = wgl.Material.NoLight();
  mat.setUniformProperty('modelColor', lightColor);
  const prog = renderer.requireProgram(mat);

  const vaoResult = wgl.factory.vao.makeSphereVao(gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
  drawable.mode = vaoResult.drawMode;

  const model = new wgl.Model(drawable, mat);
  model.transform.translate(lightPos);
  return model;
}

async function makeSkyDome(renderer: wgl.Renderer, renderContext: wgl.RenderContext): Promise<wgl.Model> {
  const resources = new SkyDomeResources('/texture/sky4.png', 5e3);
  await resources.load(err => console.log(err));

  const skyDrawable = new SkyDomeDrawable();
  skyDrawable.create(renderer, renderContext, resources);

  skyDrawable.model.transform.translate([10, 2, 10]);
  skyDrawable.model.transform.scale(100);

  return skyDrawable.model;
}

function makeSequenceModel(renderer: wgl.Renderer, renderContext: wgl.RenderContext, mousePicker: wgl.MousePicker,
  sequence: audio.Sequence, sequenceListener: audio.SequenceNoteOnListener): SequenceModel {
  return new SequenceModel(renderContext, renderer, mousePicker, sequence, sequenceListener);
}

function makeController(keyboard: wgl.Keyboard): Controller {
  const jumpButton = input.Button.bindToKey(keyboard, wgl.Keys.space, 'jump');
  const directionalInput = input.DirectionalInput.fromKeyboard(keyboard);
  directionalInput.invertZ = true;
  const rotationalInput = new input.RotationalInput();
  rotationalInput.bindToMouseMove(document.body);
  rotationalInput.bindToTouchMove(document.body);

  return new Controller(jumpButton, directionalInput, rotationalInput);
}

function updateCamera(dt: number, camera: wgl.FollowCamera, playerAabb: wgl.math.Aabb, game: Game) {
  const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
  wgl.debug.updateFollowCamera(dt, camera, target, game.mouse, game.keyboard);
}

function handleQuality(keyboard: wgl.Keyboard, qualityManager: ImageQualityManager): boolean {
  if (keyboard.isDown(wgl.Keys.k)) {
    qualityManager.cycleQuality();
    keyboard.markUp(wgl.Keys.k);
    return true;
  }
  return false;
}

function currentMouseCoordinates(gl: WebGLRenderingContext, controller: Controller): {x: number, y: number} {
  const boundRect = gl.canvas.getBoundingClientRect();
  const left = boundRect.left;
  const top = boundRect.top;

  const x = controller.rotationalInput.x() - left;
  const y = controller.rotationalInput.y() - top;

  return {x, y};
}

function handleGridManipulation(game: Game, gl: WebGLRenderingContext, camera: wgl.ICamera, view: mat4, proj: mat4, aabb: wgl.math.Aabb): void {
  if (game.gridManipulationState === GridManipulationState.Selecting) {    
    const w = gl.canvas.clientWidth;
    const h = gl.canvas.clientHeight;
    const {x, y} = currentMouseCoordinates(gl, game.controller);

    game.gridManipulator.updateSelection(x, y, w, h, view, proj, camera.position);

    if (game.gridManipulator.madeSelection()) {
      game.gridManipulationState = GridManipulationState.Adding;
    }

  } else if (game.gridManipulationState === GridManipulationState.Adding) {
    const dx = game.controller.rotationalInput.deltaX();
    const dy = game.controller.rotationalInput.deltaY();

    game.gridManipulator.updateAddition(dx, dy, aabb);

    if (game.gridManipulator.madeAddition()) {
      game.gridManipulator.clearAddition();
      game.gridManipulator.clearSelection();
      game.gridManipulationState = GridManipulationState.NotManipulating;
    }
  }
}

function gameLoop(renderer: wgl.Renderer, renderContext: wgl.RenderContext, audioContext: AudioContext, camera: wgl.FollowCamera, game: Game) {
  const frameTimer = game.frameTimer;
  const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
  const playerAabb = game.player.aabb;
  const gl = renderContext.gl;

  game.controller.update();
  game.moveControls.update(dt, camera, playerAabb);

  game.sequenceAggregate.scheduler.update();
  game.sequenceAggregate.sequenceListener.update();

  updateCamera(dt, camera, playerAabb, game);

  const view = camera.makeViewMatrix();
  const proj = camera.makeProjectionMatrix();

  handleQuality(game.keyboard, game.imageQualityManager);
  handleGridManipulation(game, renderContext.gl, camera, view, proj, playerAabb);

  const mouseCoords = currentMouseCoordinates(gl, game.controller);
  GAME.sequenceModel.update(playerAabb, mouseCoords.x, mouseCoords.y, gl.canvas.clientWidth, gl.canvas.clientHeight, view, proj, camera.position);

  const imQuality = game.imageQualityManager;
  wgl.debug.beginRender(renderContext.gl, camera, getDpr(imQuality.getQuality()), imQuality.needsUpdate());
  imQuality.clearNeedsUpdate();

  game.playerLight.setUniformProperty('position', [playerAabb.midX(), playerAabb.maxY, playerAabb.midZ()]);

  renderer.render(game.scene, camera, view, proj);

  game.worldGrid.gridDrawable.updateNewCells();
  game.worldGrid.gridDrawable.draw(view, proj, camera.position, GAME.scene);

  game.grassComponent.updateWasm(dt, playerAabb);
  game.airParticleComponent.update(dt, playerAabb);

  const sunPos = game.sunPosition;
  const sunColor = game.sunColor;

  game.grassComponent.draw(renderContext, camera, view, proj, sunPos, sunColor);
  game.airParticleComponent.draw(camera.position, view, proj, sunPos, sunColor);

  game.playerDrawable.update(playerAabb);
  game.playerDrawable.draw(view, proj, camera, game.scene);

  frameTimer.reset();
}

function fatalError(cause: string): FatalError {
  return new FatalError(cause, document.body);
}

function makeCanvasContainer(): HTMLElement {
  let makeElement: () => HTMLElement;

  if (IS_FULLSCREEN) {
    makeElement = () => document.body;
  } else {
    makeElement = () => {
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';

      const container = document.createElement('div');
      container.style.maxWidth = '500px';
      container.style.maxHeight = '500px';
      container.style.width = '100%';
      container.style.height = '100%';

      document.body.appendChild(wrapper);
      wrapper.appendChild(container);

      return container;
    }
  }

  const container = makeElement();
  
  container.addEventListener('click', e => {
    if (GAME.gridManipulationState === GridManipulationState.NotManipulating) {
      GAME.gridManipulationState = GridManipulationState.Selecting;
    }
  }); 

  return container;
}

export async function main(): Promise<void> {
  const canvasContainer = makeCanvasContainer();

  const glResult = wgl.debug.createCanvasAndContext(canvasContainer);
  if (wgl.debug.checkError(glResult)) {
    fatalError('Failed to initialize rendering context: ' + glResult.unwrapErr());
    return;
  }

  const gl = glResult.unwrap();
  const renderContext = new wgl.RenderContext(gl);

  let audioContext: AudioContext = null;

  try {
    audioContext = new (window.AudioContext || (<any>window).webkitAudioContext)();
  } catch (err) {
    fatalError('Failed to initialize audio context: ' + tryExtractErrorMessage(err));
    return;
  }

  const sounds = await makeSounds(audioContext);
  const sequenceAggregate = makeSequenceAggregate(sounds, audioContext, GAME.keyboard);

  const controller = makeController(GAME.keyboard);
  const renderer = new wgl.Renderer(renderContext);

  wgl.debug.setupDocumentBody(GAME.mouse);
  const touchElements = wgl.debug.createTouchControls(GAME.keyboard);
  gameUtil.makeTouchControls(controller, touchElements);

  const camera = wgl.debug.makeFollowCamera(renderContext.gl);
  camera.rotate(Math.PI/4, -Math.PI/7);

  const gridComponent = makeWorldGrid(renderContext);
  const gridManipulator = new WorldGridManipulator(gridComponent, GAME.mousePicker);

  const airParticleResources = new AirParticleResources(5e3, '/sound/wind-a-short2.aac');
  await airParticleResources.load(audioContext, err => console.log(err));

  const airParticles = new AirParticles(renderContext, airParticleResources.noiseSource);
  airParticles.create(GAME.airParticleOptions);

  const grassResources = new GrassResources(5e3, '/sound/lf_noise_short.m4a', wasm.grass.makeMemory());
  await grassResources.load(audioContext, err => console.log(err));

  const grassComponent = new GrassComponent(renderContext, grassResources);
  GAME.grassTileOptions.offsetY = gridComponent.voxelGrid.cellDimensions[1];
  grassComponent.create(GAME.grassTileOptions, GAME.grassModelOptions, GAME.grassTextureOptions);

  const playerDrawableResources = new PlayerDrawableResources('/buffer/frame_64px_120frames.bin', 5e3);
  await playerDrawableResources.load(err => console.log(err));

  const playerDims = [1.01, 2.01, 1.01];
  const player = new Player(playerDims);
  const playerMovement = new PlayerMovement(gridComponent.voxelGrid);

  const playerDrawable = new PlayerDrawable(renderContext, renderer);
  playerDrawable.create(playerDrawableResources);

  const sequenceModel = makeSequenceModel(renderer, renderContext, GAME.mousePicker, sequenceAggregate.sequence, sequenceAggregate.sequenceListener);
  const skyDome = await makeSkyDome(renderer, renderContext);

  const sun = wgl.Light.Directional();
  sun.setUniformProperty('color', GAME.sunColor);
  sun.setUniformProperty('position', GAME.sunPosition);

  const sunModel = makeLightModel(renderer, renderContext, GAME.sunPosition, GAME.sunColor);
  const light2Model = makeLightModel(renderer, renderContext, [0, 8, 0], [1, 1, 1]);
  GAME.scene.addModel(sunModel);
  GAME.scene.addModel(light2Model);

  const sun2 = wgl.Light.Point();
  sun2.setUniformProperty('color', [1, 1, 1]);
  sun2.setUniformProperty('position', [0, 8, 0]);
  GAME.scene.addLight(sun2);

  const playerLight = wgl.Light.Point();
  playerLight.setUniformProperty('color', [0.005, 0.005, 0.005]);
  GAME.scene.addLight(playerLight);

  player.aabb.moveTo3(7.5, 7.5, 7.5);

  GAME.playerMovement = playerMovement;
  GAME.player = player;
  GAME.frameTimer = new Stopwatch();
  GAME.worldGrid = gridComponent;
  GAME.airParticleComponent = airParticles;
  GAME.grassComponent = grassComponent;
  GAME.gridManipulator = gridManipulator;
  GAME.moveControls = new PlayerMoveControls(playerMovement, controller);
  GAME.controller = controller;
  GAME.playerDrawable = playerDrawable;
  GAME.playerLight = playerLight;
  GAME.scene.addModel(skyDome);
  GAME.sequenceModel = sequenceModel;
  GAME.sequenceAggregate = sequenceAggregate;

  sequenceModel.create();
  sequenceModel.addToScene(GAME.scene);

  function renderLoop() {
    gameLoop(renderer, renderContext, audioContext, camera, GAME);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();
}
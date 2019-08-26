import * as wgl from '../src/gl';
import * as game from '../src/game';
import * as util from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as grassSources from './shaders/debug-grass3';

function makeTexturedQuadModel(renderContext: wgl.RenderContext, renderer: wgl.Renderer, texture: wgl.Texture2D): wgl.Model {
  const mat = wgl.Material.NoLight();
  mat.setUniformProperty('modelColor', texture);
  const prog = renderer.requireProgram(mat);
  const vaoResult = wgl.factory.vao.makeQuadUvVao(renderContext.gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
  return new wgl.Model(drawable, mat);
}

function makeDebugWindQuad(renderContext: wgl.RenderContext, renderer: wgl.Renderer, scene: wgl.Scene, windTexture: wgl.Texture2D) {
  const model = makeTexturedQuadModel(renderContext, renderer, windTexture);

  mat4.translate(model.transform.matrix, model.transform.matrix, [-3, 2, 10]);
  mat4.rotateY(model.transform.matrix, model.transform.matrix, Math.PI);
  
  scene.addModel(model);
}

function makeDebugDisplacementQuad(renderContext: wgl.RenderContext, renderer: wgl.Renderer, scene: wgl.Scene, texture: wgl.Texture2D) {
  const model = makeTexturedQuadModel(renderContext, renderer, texture);

  mat4.translate(model.transform.matrix, model.transform.matrix, [-1, 2, 10]);
  mat4.rotateY(model.transform.matrix, model.transform.matrix, Math.PI);
  
  scene.addModel(model);  
}

abstract class GrassTextureBase {
  protected renderContext: wgl.RenderContext;
  texture: wgl.Texture2D;
  private isBound: boolean;

  constructor(renderContext: wgl.RenderContext) {
    this.renderContext = renderContext;
    this.isBound = false;
  }

  index(): number {
    return this.texture.index;
  }

  bind(): void {
    this.isBound = this.renderContext.pushActiveTexture2DAndBind(this.texture);
  }

  unbind(): void {
    if (this.isBound) {
      this.renderContext.popTexture2D();
    }
  }
}

class GrassLocalMovementTexture extends GrassTextureBase {
  private noiseIndices: Int32Array;
  private noiseSource: Float32Array;
  private readonly textureSize = 256;
  private readonly numPixels: number;
  private textureData: Uint8Array;

  constructor(renderContext: wgl.RenderContext, noiseSource: Float32Array) {
    super(renderContext);
    this.numPixels = this.textureSize * this.textureSize;
    this.noiseIndices = new Int32Array(this.numPixels);
    this.noiseSource = noiseSource;

    game.gameUtil.makeRandomizedIndices(this.noiseIndices, this.noiseSource.length);

    this.makeTexture();
  }

  private makeTexture(): void {
    const gl = this.renderContext.gl;
    const textureData = new Uint8Array(this.textureSize * this.textureSize);
    const texture = wgl.Texture2D.linearRepeatAlpha(gl, this.textureSize);

    texture.wrapS = gl.CLAMP_TO_EDGE;
    texture.wrapT = gl.CLAMP_TO_EDGE;

    texture.bindAndConfigure();
    texture.fillImage(textureData);

    this.texture = texture;
    this.textureData = textureData;
  }

  update(dt: number): void {
    const numPixels = this.textureSize * this.textureSize;

    for (let i = 0; i < numPixels; i++) {
      const noiseIndex = (this.noiseIndices[i] + 1) % this.noiseSource.length;
      const noise = this.noiseSource[noiseIndex];
      this.noiseIndices[i] = noiseIndex;
      this.textureData[i] = noise * 255;
    }

    this.bind();
    this.texture.subImage(this.textureData);
    this.unbind();
  }
}

class GrassDisplacementTexture extends GrassTextureBase {
  private textureSize = 128;
  private textureData: Uint8Array;

  constructor(renderContext: wgl.RenderContext) {
    super(renderContext);
    this.renderContext = renderContext;
    this.makeTexture();
  }

  private makeTexture(): void {
    const textureData = new Uint8Array(this.textureSize * this.textureSize * 4);
    const texture = wgl.Texture2D.nearestEdgeClampedRGBA(this.renderContext.gl, this.textureSize);

    texture.bindAndConfigure();
    texture.fillImage(textureData);

    this.texture = texture;
    this.textureData = textureData;
  }

  update(dt: number, playerAabb: wgl.math.Aabb, maxDim: number, scaleX: number, scaleZ: number, offsets: wgl.types.Real3, bladeHeight: number): void {
    const playerX = playerAabb.midX() - offsets[0];
    const playerY = playerAabb.minY - offsets[1];
    const playerZ = playerAabb.midZ() - offsets[2];
    const playerWidth = playerAabb.width();
    const playerDepth = playerAabb.depth();

    const fracLocX = playerX / maxDim;
    const fraclocZ = playerZ / maxDim;

    const textureSize = this.textureSize;
    const textureData = this.textureData;

    const fracWidth = wgl.math.clamp01((playerWidth * scaleX) / maxDim);
    const fracDepth = wgl.math.clamp01((playerDepth * scaleZ) / maxDim);

    const minX = wgl.math.clamp01(fracLocX - fracWidth/2);
    const minZ = wgl.math.clamp01(fraclocZ - fracDepth/2);

    let numPixelsX = Math.floor(textureSize * fracWidth);
    let numPixelsZ = Math.floor(textureSize * fracDepth);

    const startPixelX = Math.floor(minX * textureSize);
    const startPixelZ = Math.floor(minZ * textureSize);

    const midPixelX = (minX + fracWidth/2) * textureSize;
    const midPixelZ = (minZ + fracDepth/2) * textureSize;

    const outOfBoundsXz = fracLocX > 1 || fracLocX < 0 || fraclocZ > 1 || fraclocZ < 0;
    const outOfBoundsY = playerY < 0 || playerY > bladeHeight;

    if (outOfBoundsXz || outOfBoundsY) {
      numPixelsX = 0;
      numPixelsZ = 0;
    }

    const numData = textureSize * textureSize * 4;

    for (let i = 0; i < numData; i++) {
      textureData[i] /= 1.05;
    }

    for (let i = 0; i < numPixelsX; i++) {
      for (let j = 0; j < numPixelsZ; j++) {
        const idxX = i + startPixelX;
        const idxZ = j + startPixelZ;

        const pixelIdx = (idxZ * textureSize + idxX) * 4;

        const dx = idxX - midPixelX;
        const dz = idxZ - midPixelZ;
        
        let dirX = dx / (midPixelX - startPixelX);
        let dirZ = dz / (midPixelZ - startPixelZ);

        const normX = (dirX + 1) * 0.5;
        const normZ = (dirZ + 1) * 0.5;

        textureData[pixelIdx+0] = normX * 255;
        textureData[pixelIdx+2] = normZ * 255;
        textureData[pixelIdx+3] = 127;
      }
    }

    this.bind();
    this.texture.subImage(this.textureData);
    this.unbind();
  }
}

class GrassWindTexture extends GrassTextureBase {
  private readonly textureSize = 128;
  private textureData: Uint8Array;
  private minRow: number;
  private readonly rowDistance = 128;
  private rowIncrement: number;
  private noiseSource: Float32Array;
  private noiseIndex: number;
  private noiseIndices: Int32Array;

  constructor(renderContext: wgl.RenderContext, noiseSource: Float32Array) {
    super(renderContext);
    this.minRow = 0;
    this.rowIncrement = 0.25;
    this.noiseSource = noiseSource;
    this.noiseIndex = 0;
    this.noiseIndices = new Int32Array(this.textureSize*this.textureSize);
    game.gameUtil.makeWhiteNoiseIndices(this.noiseIndices, this.noiseSource.length);
    this.makeTexture();
  }

  private makeTexture(): void {
    const textureData = new Uint8Array(this.textureSize * this.textureSize * 4);
    const texture = wgl.Texture2D.linearRepeatRGBA(this.renderContext.gl, this.textureSize);

    texture.bindAndConfigure();
    texture.fillImage(textureData);

    this.texture = texture;
    this.textureData = textureData;
  }

  update(dt: number): void {
    const numPixels = this.textureSize * this.textureSize;
    const numData = numPixels * 4;

    for (let i = 0; i < numData; i++) {
      this.textureData[i] /= 1.05;
    }

    const minRow = Math.floor(this.minRow);

    const noiseIndex = (this.noiseIndex + 1) % this.noiseSource.length;
    const noiseSample = this.noiseSource[noiseIndex];
    this.noiseIndex = noiseIndex;

    for (let i = 0; i < this.rowDistance; i++) {
      const rowInd = ((minRow + i) % this.textureSize) * this.textureSize;
      const rowInd4 = rowInd * 4;
      const rowFactor = 1 - Math.abs((i / (this.rowDistance-1) - 0.5));

      for (let j = 0; j < this.textureSize; j++) {
        const ind = rowInd + j;
        const ind4 = rowInd4 + j*4;

        const pixelNoiseIndex = (this.noiseIndices[ind] + 1) % this.noiseSource.length;
        const pixelNoise = this.noiseSource[pixelNoiseIndex];
        this.noiseIndices[ind] = pixelNoiseIndex;

        this.textureData[ind4 + 2] = 255 * noiseSample * rowFactor * pixelNoise;
      }
    }

    this.minRow += this.rowIncrement;
    if (this.minRow >= this.textureSize) {
      this.minRow = 0;
    }

    this.bind();
    this.texture.subImage(this.textureData);
    this.unbind();
  }
}

class GrassBlade {
  private renderContext: wgl.RenderContext;
  private drawable: wgl.types.Drawable;
  private program: wgl.Program;
  private numBlades: number;
  private model: mat4;
  private rotations: Float32Array;
  private uvs: Float32Array;
  private translations: Float32Array;
  private noiseIndices: Int32Array;
  private noiseSource: Float32Array;

  private numSegments = 3;
  private numBladesPerDim = 100;
  private spacing = 10;

  private bladeScale = [0.075, 1, 1];
  private color = [0.5, 1, 0.5];
  private sampleSpeed = 1;
  private position = [0, 0, 0];

  private readonly usePerInstanceNoise = false;

  windTexture: GrassWindTexture;
  displacementTexture: GrassDisplacementTexture;
  localMovementTexture: GrassLocalMovementTexture;

  constructor(renderContext: wgl.RenderContext, noiseSource: Float32Array) {
    this.renderContext = renderContext;
    this.model = mat4.create();
    this.numBlades = this.numBladesPerDim * this.numBladesPerDim;
    this.noiseSource = noiseSource;
    this.makeInstanceData();
    this.makeDrawable();
    this.windTexture = new GrassWindTexture(renderContext, noiseSource);
    this.displacementTexture = new GrassDisplacementTexture(renderContext);
    this.localMovementTexture = new GrassLocalMovementTexture(renderContext, noiseSource);
  }

  private makeInstanceData(): void {
    this.createInstanceData();
    this.initializeInstanceData();
  }

  private createInstanceData(): void {
    this.rotations = new Float32Array(this.numBlades);
    this.translations = new Float32Array(this.numBlades*2);
    this.uvs = new Float32Array(this.numBlades*2);
    this.noiseIndices = new Int32Array(this.numBlades);
  }

  private initializeInstanceData(): void {
    for (let i = 0; i < this.numBlades; i++) {
      const x = Math.random();
      const z = Math.random();

      this.rotations[i] = Math.random() * Math.PI;
      this.translations[i*2] = x * this.spacing;
      this.translations[i*2+1] = z * this.spacing;

      this.uvs[i*2] = x;
      this.uvs[i*2+1] = z;
    }

    game.gameUtil.makeRandomizedIndices(this.noiseIndices, this.noiseSource.length);
  }

  private makeDrawable(): void {
    const gl = this.renderContext.gl;
    const prog = wgl.Program.fromSources(gl, grassSources.vertex, grassSources.fragment);
    
    const numSegments = this.numSegments;
    const positions = wgl.debug.segmentedQuadPositions(numSegments);

    const vboDescriptors: Array<wgl.types.VboDescriptor> = [
      {name: 'position', attributes: [wgl.types.makeAttribute('a_position', gl.FLOAT, 3)], data: positions},
    ];

    const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors);
    const drawable = wgl.types.Drawable.fromProperties(this.renderContext, vao, wgl.types.DrawFunctions.arrays);
    drawable.count = positions.length/3;

    this.drawable = drawable;
    this.program = prog;
  }

  private toggleCullFace(on: boolean): void {
    if (on) {
      this.renderContext.gl.enable(this.renderContext.gl.CULL_FACE);
    } else {
      this.renderContext.gl.disable(this.renderContext.gl.CULL_FACE);
    }
  }

  private configureModelMatrix(x: number, z: number, index: number): void {
    mat4.identity(this.model);
    mat4.translate(this.model, this.model, [x, 0, z]);
    //  Additional noise in wind direction.
    mat4.rotateY(this.model, this.model, this.rotations[index]);
    mat4.scale(this.model, this.model, this.bladeScale);
  }

  update(dt: number, playerAabb: wgl.math.Aabb): void {
    this.windTexture.update(dt);
    this.localMovementTexture.update(dt);
    this.displacementTexture.update(dt, playerAabb, this.spacing, 1, 1, this.position, this.bladeScale[1]);
  }

  render(view: mat4, proj: mat4, cameraFront: wgl.types.Real3): void {
    const localMovementDirection = Math.atan2(cameraFront[2], cameraFront[0]) + Math.PI/2;

    this.windTexture.bind();
    this.localMovementTexture.bind();
    this.displacementTexture.bind();

    this.renderContext.useProgram(this.program);

    this.program.setMat4('view', view);
    this.program.setMat4('projection', proj);
    this.program.setVec3('color', this.color);
    this.program.set3f('local_movement_direction', Math.cos(localMovementDirection), 0, Math.sin(localMovementDirection));
    this.program.set1f('local_movement_amount', 0.75);
    this.program.setTexture('wind_texture', this.windTexture.index());
    this.program.setTexture('local_movement_texture', this.localMovementTexture.index());
    this.program.setTexture('displacement_texture', this.displacementTexture.index());

    this.toggleCullFace(false);
    this.renderContext.bindVao(this.drawable.vao);
    this.drawGrid();
    this.toggleCullFace(true);

    this.windTexture.unbind();
    this.localMovementTexture.unbind();
    this.displacementTexture.unbind();
  }

  private drawGrid(): void {
    let index = 0;
    for (let i = 0; i < this.numBladesPerDim; i++) {
      for (let j = 0; j < this.numBladesPerDim; j++) {
        const x = this.translations[index*2];
        const y = this.translations[index*2+1];
        const u = this.uvs[index*2];
        const v = this.uvs[index*2+1];

        const noiseIndex = (this.noiseIndices[index] + this.sampleSpeed) % this.noiseSource.length;
        const noise = this.noiseSource[noiseIndex];
        this.noiseIndices[index] = noiseIndex;

        if (this.usePerInstanceNoise) {
          this.program.set1f('t', -noise * 0.15);
        }

        this.program.set2f('grid_position', u, v);

        this.configureModelMatrix(x, y, index);
        this.program.setMat4('model', this.model);

        this.drawable.draw();
        index++;
      }
    }
  }
}

class Game {
  private scene: wgl.Scene;
  private renderContext: wgl.RenderContext;
  private audioContext: AudioContext;
  private renderer: wgl.Renderer;
  private camera: wgl.ICamera;
  private controller: game.Controller;
  private keyboard: wgl.Keyboard;
  private mouseState: wgl.debug.DebugMouseState;
  private playerAabb: wgl.math.Aabb;
  private frameTimer: util.Stopwatch;
  private cameraTarget: wgl.Model;
  private imageQuality: game.ImageQuality = game.ImageQuality.High;
  private movementSpeed = 0.25;
  private grassBlade: GrassBlade;
  private grassResources: game.GrassResources;

  constructor() {
    this.setupDocument();

    this.scene = new wgl.Scene();
    this.audioContext = new ((<any>window).webkitAudioContext || window.AudioContext)();
    this.renderContext = new wgl.RenderContext(this.makeContext());
    this.camera = this.makeCamera();
    this.renderer = new wgl.Renderer(this.renderContext);
    this.keyboard = new wgl.Keyboard();
    this.controller = this.makeController(this.keyboard);
    this.frameTimer = new util.Stopwatch();

    this.makePlayer();
    this.makeDebugCubes();
  }

  private makeGrass(): void {
    wgl.math.normalize01(this.grassResources.noiseSource, this.grassResources.noiseSource);
    const grassBlade = new GrassBlade(this.renderContext, this.grassResources.noiseSource);
    this.grassBlade = grassBlade;

    makeDebugWindQuad(this.renderContext, this.renderer, this.scene, grassBlade.windTexture.texture);
    makeDebugDisplacementQuad(this.renderContext, this.renderer, this.scene, grassBlade.displacementTexture.texture);
  }

  private makeDebugCubes(): void {
    const mat = wgl.Material.NoLight();
    mat.setUniformProperty('modelColor', [1, 1, 1]);

    const prog = this.renderer.requireProgram(mat);
    const cubeVao = wgl.factory.vao.makeCubeVao(this.renderContext.gl, prog);
    const cube = wgl.types.Drawable.indexed(this.renderContext, cubeVao.vao, cubeVao.numIndices);
    const cubeModel = new wgl.Model(cube, mat);

    cubeModel.transform.translate([1, 1, 10]);

    const cameraTarget = new wgl.Model(cube, wgl.Material.NoLight());
    this.cameraTarget = cameraTarget;

    // this.scene.addModel(cubeModel);
    this.scene.addModel(cameraTarget);
  }

  private async loadGrassResources(): Promise<void> {
    // const grassFile = 'lf_noise_short.m4a';
    const grassFile = 'lf_noise_short-trunc-flipped.m4a';
    const grassResources = new game.GrassResources(5e3, '/sound/' + grassFile, null);
    await grassResources.load(this.audioContext, err => console.log(err));
    this.grassResources = grassResources;
  }

  private async makeSkyDome(): Promise<void> {
    const resources = new game.SkyDomeResources('/texture/sky4.png', 5e3);
    await resources.load(err => console.log(err));
  
    const skyDrawable = new game.SkyDomeDrawable();
    skyDrawable.create(this.renderer, this.renderContext, resources);
  
    skyDrawable.model.transform.translate([10, 2, 10]);
    skyDrawable.model.transform.scale(100);
  
    this.scene.addModel(skyDrawable.model);
  }

  private makeCamera(): wgl.FollowCamera {
    const camera = wgl.debug.makeFollowCamera(this.renderContext.gl);
    return camera;
  }

  private makePlayer(): void {
    const playerDims = [1.01, 2.01, 1.01];
    const player = new game.Player(playerDims);
    this.playerAabb = player.aabb;
  }

  private setupDocument(): void {
    const mouseState = wgl.debug.makeDebugMouseState();
    wgl.debug.setupDocumentBody(mouseState);
    this.mouseState = mouseState;
  }

  private makeContext(): WebGLRenderingContext {
    return wgl.debug.createCanvasAndContext(document.body).unwrap();
  }

  private makeController(keyboard: wgl.Keyboard): game.Controller {
    const jumpButton = game.input.Button.bindToKey(keyboard, wgl.Keys.space);
    const directionalInput = game.input.DirectionalInput.fromKeyboard(keyboard);
    directionalInput.invertZ = true;
    const rotationalInput = new game.input.RotationalInput();
    rotationalInput.bindToMouseMove(document.body);
    rotationalInput.bindToTouchMove(document.body);
    
    return new game.Controller(jumpButton, directionalInput, rotationalInput);
  }

  private updateCamera(dt: number): void {
    const playerAabb = this.playerAabb;
    const camera = this.camera as wgl.FollowCamera;
    const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
    wgl.debug.updateFollowCamera(dt, camera, target, this.mouseState, this.keyboard);

    this.cameraTarget.material.setUniformProperty('modelColor', [0.25, 0, 1]);
    this.cameraTarget.transform.identity();
    this.cameraTarget.transform.translate(target);
    this.cameraTarget.transform.scale(0.25);
  }

  private updatePosition(): void {
    const front = vec3.create();
    const right = vec3.create();

    this.camera.getFront(front);
    this.camera.getRight(right);
    
    front[1] = 0;
    wgl.math.norm3(front, front);
    
    const z = this.controller.directionalInput.getZ();
    const x = this.controller.directionalInput.getX();

    wgl.math.scale3(front, front, z);
    wgl.math.scale3(right, right, x);
    wgl.math.add3(front, front, right);
    wgl.math.scale3(front, front, this.movementSpeed);

    this.playerAabb.move(front);
  }

  private updateDt(): number {
    const frameTimer = this.frameTimer;
    const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
    this.frameTimer.reset();
    return dt;
  }

  private render(view: mat4, proj: mat4): void {
    wgl.debug.beginRender(this.renderContext.gl, this.camera, game.getDpr(this.imageQuality));
    this.renderer.render(this.scene, this.camera, view, proj);
  }

  async initialize(): Promise<void> {
    await this.makeSkyDome();
    await this.loadGrassResources();
    this.makeGrass();
  }

  private getCameraFront(): Array<number> {
    const front = [0, 0, 0];
    this.camera.getFront(front);
    front[1] = 0;
    wgl.math.norm3(front, front);
    return front;
  }

  update(): void {
    const dt = this.updateDt();

    this.controller.update();
    this.updatePosition();
    this.updateCamera(dt);
    this.grassBlade.update(dt, this.playerAabb);

    const view = this.camera.makeViewMatrix();
    const proj = this.camera.makeProjectionMatrix();
    const front = this.getCameraFront();

    this.render(view, proj);
    this.grassBlade.render(view, proj, front);
  }
}

export async function main(): Promise<void> {
  const game = new Game();
  await game.initialize();
  
  const updater = () => {
    window.requestAnimationFrame(updater);
    game.update();
  }

  window.requestAnimationFrame(updater);
}
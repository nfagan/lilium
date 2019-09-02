import * as wgl from '../src/gl';
import * as game from '../src/game';
import * as util from '../src/util';
import { mat4, vec3 } from 'gl-matrix';

class TerrainQuad {
  private model: wgl.Model;
  private scale = 0;

  constructor(renderContext: wgl.RenderContext, renderer: wgl.Renderer) {
    const mat = wgl.Material.NoLight();
    const model = makeQuadModel(renderContext, renderer, mat);

    mat.setUniformProperty('modelColor', [0.5, 1, 0.5]);
    model.transform.translate([10, -this.scale, 10]);
    model.transform.scale(this.scale);
    mat4.rotateX(model.transform.matrix, model.transform.matrix, -Math.PI/2);

    this.model = model;
  }

  addToScene(scene: wgl.Scene): void {
    scene.addModel(this.model);
  }
}

function makeQuadModel(renderContext: wgl.RenderContext, renderer: wgl.Renderer, material: wgl.Material): wgl.Model {
  const prog = renderer.requireProgram(material);
  const vaoResult = wgl.factory.vao.makeQuadUvVao(renderContext.gl, prog);
  const drawable = wgl.types.Drawable.indexed(renderContext, vaoResult.vao, vaoResult.numIndices);
  return new wgl.Model(drawable, material);
}

function makeTexturedQuadModel(renderContext: wgl.RenderContext, renderer: wgl.Renderer, texture: wgl.Texture2D): wgl.Model {
  const mat = wgl.Material.NoLight();
  mat.setUniformProperty('modelColor', texture);
  return makeQuadModel(renderContext, renderer, mat);
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
  private grassBlade: game.grassV2.GrassDrawable;
  private grassResources: game.GrassResources;

  private sunPosition = [50, 20, 50];
  private sunColor = [1, 1, 1];

  private terrainQuad: TerrainQuad;
  private terrainHeightMap: wgl.terrain.IHeightMap;
  private terrainHeightScale = 3;

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

  private makeGrass(heightMap: wgl.terrain.IHeightMap): void {
    wgl.math.normalize01(this.grassResources.noiseSource, this.grassResources.noiseSource);
    const grassBlade = new game.grassV2.GrassDrawable(this.renderContext, this.grassResources.noiseSource, heightMap, this.terrainHeightScale);
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

  private async makeTerrain(): Promise<void> {
    const image = await util.loadImageObject('/texture/sphere-heightmap2.png');
    const heightMap = new wgl.terrain.ImageHeightMap(image);
    this.terrainHeightMap = heightMap;
    this.terrainQuad = new TerrainQuad(this.renderContext, this.renderer);
    this.terrainQuad.addToScene(this.scene);
  }

  private makeCamera(): wgl.FollowCamera {
    const camera = wgl.debug.makeFollowCamera(this.renderContext.gl);
    camera.rotate(Math.PI/6, 0);
    return camera;
  }

  private makePlayer(): void {
    const playerDims = [1.01, 2.01, 1.01];
    const player = new game.Player(playerDims);
    this.playerAabb = player.aabb;
    this.playerAabb.moveTo3(10, 0, 10);
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

    const scale = [this.playerAabb.width()/2, this.playerAabb.height()/2, this.playerAabb.depth()/2];

    this.cameraTarget.material.setUniformProperty('modelColor', [0.25, 0, 1]);
    this.cameraTarget.transform.identity();
    this.cameraTarget.transform.translate(target);
    this.cameraTarget.transform.scale(scale);
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

    const fracX = this.playerAabb.midX() / this.grassBlade.getGridScale();
    const fracZ = this.playerAabb.midZ() / this.grassBlade.getGridScale();
    //  Flipped
    const y = this.terrainHeightMap.normalizedValueAtNormalizedXz(fracX, fracZ) * this.terrainHeightScale;
    
    this.playerAabb.moveToY(y);
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
    await this.makeTerrain();
    this.makeGrass(this.terrainHeightMap);
  }

  update(): void {
    const dt = this.updateDt();

    this.controller.update();
    this.updatePosition();
    this.updateCamera(dt);
    this.grassBlade.update(dt, this.playerAabb);

    const view = this.camera.makeViewMatrix();
    const proj = this.camera.makeProjectionMatrix();

    this.render(view, proj);
    this.grassBlade.render(view, proj, this.camera, this.sunPosition, this.sunColor);
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
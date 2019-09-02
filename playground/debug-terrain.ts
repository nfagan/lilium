import * as wgl from '../src/gl';
import * as game from '../src/game';
import * as util from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as terrainSources from './shaders/debug-terrain';
import * as grassSources from './shaders/debug-terrain-grass';

function makeHeightMapTexture(gl: WebGLRenderingContext, heightMapImage: util.Image): wgl.Texture2D {
  const tex = wgl.Texture2D.linearRepeatRGBA(gl, heightMapImage.width);

  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;
  
  tex.bindAndConfigure();
  tex.fillImage(heightMapImage.data as Uint8Array);

  return tex;
}

type TerrainGrassDrawableOptions = {
  grassGridScale: Array<number>, 
  bladeScale: Array<number>, 
  gridOffset: Array<number>,
  numBladesPerDim: number
}

class TerrainGrassDrawable {
  private renderContext: wgl.RenderContext;
  private numBladesPerDim: number;
  private gridScaleX: number;
  private gridScaleZ: number;
  private numBlades: number;
  private readonly numSegments = 3;
  private readonly color = [0.5, 1, 0.5];
  private readonly bladeScale: Array<number>;
  private gridOffsetX: number;
  private gridOffsetZ: number;

  private translationVbo: wgl.Vbo;
  private translations: Float32Array;
  private rotations: Float32Array;

  private drawable: wgl.types.Drawable;
  private program: wgl.Program;

  private heightMap: wgl.terrain.IHeightMap;
  private heightMapTexture: wgl.Texture2D;
  private heightScale: number;
  private terrainGridScale: number;

  private readonly grassCellDim = 64;
  private grassGridTexture: wgl.Texture2D;
  private grassGridCellOffsets: Float32Array;

  constructor(renderContext: wgl.RenderContext, heightMap: wgl.terrain.IHeightMap, heightMapTexture: wgl.Texture2D, 
    heightScale: number, terrainGridScale: number, options: TerrainGrassDrawableOptions) {
    //  1) Assign grass to N xz-cells.
    //      - Each cell has an offset and a size.
    //  2) For each of N cells, test whether the cell is sufficiently behind the camera
    //  3) If so, move the cell forwards.
    //
    //  Each cell has a position -- express grass positions as an offset with respect to the cell origin.
    //    Then you only have to update the cell's position.
    //    Use float texture
    //    Quad-tree may come in handy here.

    this.renderContext = renderContext;
    this.heightMap = heightMap;
    this.heightMapTexture = heightMapTexture;
    this.heightScale = heightScale;
    this.terrainGridScale = terrainGridScale;
    this.numBladesPerDim = options.numBladesPerDim;
    this.numBlades = this.numBladesPerDim * this.numBladesPerDim;
    this.gridScaleX = options.grassGridScale[0];
    this.gridScaleZ = options.grassGridScale[1];
    this.bladeScale = options.bladeScale;
    this.gridOffsetX = options.gridOffset[0];
    this.gridOffsetZ = options.gridOffset[1];

    this.createInstanceData();
    this.initializeInstanceData();
    this.makeDrawable();
    this.makeGrassGridTexture();
  }

  private createInstanceData(): void {
    this.rotations = new Float32Array(this.numBlades);
    this.translations = new Float32Array(this.numBlades*3);
  }

  private initializeInstanceData(): void {
    for (let i = 0; i < this.numBlades; i++) {
      const x = Math.random();
      const z = Math.random();

      // const terrainX = x * this.gridScale / this.terrainGridScale;
      // const terrainZ = 1 - (z * this.gridScale / this.terrainGridScale);

      this.rotations[i] = Math.random() * Math.PI;
      this.translations[i*3] = x * this.gridScaleX;
      // this.translations[i*3+1] = this.heightMap.normalizedValueAtNormalizedXz(terrainX, terrainZ) * this.heightScale;
      this.translations[i*3+2] = z * this.gridScaleZ;
    }
  }

  private makeGrassGridTexture(): void {
    const gl = this.renderContext.gl;
    const cellDim = this.grassCellDim;
    const tex = wgl.Texture2D.nearestEdgeClampedRGBA(gl, cellDim);
    const cellOffsets = new Float32Array(cellDim * cellDim * 4);
    let index = 0;

    for (let i = 0; i < cellDim; i++) {
      for (let j = 0; j < cellDim; j++) {
        const x = (i / cellDim) * this.gridScaleX + this.gridOffsetX;
        const z = (j / cellDim) * this.gridScaleZ + this.gridOffsetZ;

        cellOffsets[index*4] = x;
        cellOffsets[index*4+2] = z;
        index++;
      }
    }
    
    tex.srcType = gl.FLOAT;
    tex.bindAndConfigure();
    tex.fillImage(cellOffsets);
    
    this.grassGridTexture = tex;
    this.grassGridCellOffsets = cellOffsets;
  }

  private makeDrawable(): void {
    const gl = this.renderContext.gl;
    const prog = wgl.Program.fromSources(gl, grassSources.vertex, grassSources.fragment);
    
    const numSegments = this.numSegments;
    const numInstances = this.numBlades;
    const positions = wgl.debug.segmentedQuadPositions(numSegments);

    const vboDescriptors: Array<wgl.types.VboDescriptor> = [
      {name: 'position', attributes: [wgl.types.makeAttribute('a_position', gl.FLOAT, 3, 0)], data: positions},
      {name: 'translation', attributes: [wgl.types.makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: this.translations},
      {name: 'rotation', attributes: [wgl.types.makeAttribute('a_rotation', gl.FLOAT, 1, 1)], data: this.rotations}
    ];

    const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors);
    const drawable = wgl.types.Drawable.fromProperties(this.renderContext, vao, wgl.types.DrawFunctions.arraysInstanced);

    drawable.isInstanced = true;
    drawable.count = positions.length/3;
    drawable.numActiveInstances = numInstances;

    this.drawable = drawable;
    this.program = prog;
    this.translationVbo = vao.getVbo('translation');
  }

  update(dt: number, playerPos: wgl.types.Real3, camera: wgl.ICamera): void {
    const front = vec3.create();
    const camX = camera.position[0];
    const camZ = camera.position[2];

    camera.getFront(front);
    front[1] = 0;
    vec3.normalize(front, front);

    const cellDim = this.grassCellDim;
    const fx = front[0];
    const fz = front[2];

    let needUpdate = false;
    const cellOffsets = this.grassGridCellOffsets;

    for (let i = 0; i < cellDim; i++) {
      for (let j = 0; j < cellDim; j++) {
        const cx = (i + 1) / cellDim * this.gridScaleX + (cellDim / this.gridScaleX) / 2;
        const cz = (j + 1) / cellDim * this.gridScaleZ + (cellDim / this.gridScaleZ) / 2;

        let dx = camX - cx;
        let dz = camZ - cz;

        const len = Math.sqrt(dx * dx + dz * dz);

        dx /= len;
        dz /= len;

        const dp = dx * fx + dz * fz;

        if (dp < 0) {
          needUpdate = false;

          const cellInd = j * cellDim * 4 + i * 4;
          cellOffsets[cellInd] = this.gridScaleZ;
        }
      }
    }

    if (needUpdate) {
      this.grassGridTexture.bind();
      this.grassGridTexture.subImage(cellOffsets);
    }
  }

  render(view: mat4, proj: mat4, camera: wgl.ICamera, sunPosition: wgl.types.Real3, sunColor: wgl.types.Real3): void {
    this.renderContext.useProgram(this.program);

    this.renderContext.gl.disable(this.renderContext.gl.CULL_FACE);
    this.grassGridTexture.index = this.heightMapTexture.index + 2;
    this.grassGridTexture.activateAndBind();

    wgl.debug.setViewProjection(this.program, view, proj);
    this.program.setVec3('color', this.color);
    this.program.setVec3('blade_scale', this.bladeScale);
    this.program.set3f('world_position', 0, 0, 0);

    this.program.setVec3('sun_color', sunColor);
    this.program.setVec3('sun_position', sunPosition);
    this.program.setVec3('camera_position', camera.position);

    this.program.set2f('grid_scale', this.gridScaleX, this.gridScaleZ);
    this.program.set1f('terrain_grid_scale', this.terrainGridScale);
    this.program.set1f('height_scale', this.heightScale);
    this.program.set1f('grid_cell_dim', this.grassCellDim);
    this.program.setTexture('height_map', this.heightMapTexture.index);
    this.program.setTexture('cell_offset_map', this.grassGridTexture.index);

    // this.program.setTexture('sky_dome_texture', skyDomeTexture.index);
    // this.program.setVec3('sky_dome_origin', skyDomeOrigin);
    // this.program.set1f('sky_dome_radius', skyDomeRadius);

    this.renderContext.bindVao(this.drawable.vao);
    this.drawable.draw();

    this.renderContext.gl.enable(this.renderContext.gl.CULL_FACE);
  }
}

class TerrainDrawable {
  private renderContext: wgl.RenderContext;

  private model: wgl.Model;
  private drawable: wgl.types.Drawable;
  private program: wgl.Program;
  private heightMap: wgl.terrain.IHeightMap;
  private heightMapTexture: wgl.Texture2D;
  private useHeightMapTexture = true;

  private skyDomeTexture: wgl.Texture2D;
  private skyDomeRadius: number;

  readonly gridScale: number;
  readonly heightScale: number;
  private color = [0.5, 1, 0.5];

  constructor(renderContext: wgl.RenderContext, heightMap: wgl.terrain.IHeightMap, 
    heightMapTexture: wgl.Texture2D, skyDomeTexture: wgl.Texture2D, skyDomeRadius: number, gridScale: number, heightScale: number) {

    this.renderContext = renderContext;
    this.heightMap = heightMap;
    this.heightMapTexture = heightMapTexture;
    this.gridScale = gridScale;
    this.heightScale = heightScale;

    this.skyDomeTexture = skyDomeTexture;
    this.skyDomeRadius = skyDomeRadius;

    this.makeDrawable();
  }

  private makeDrawable(): void {
    const renderContext = this.renderContext;
    const gl = renderContext.gl;

    const mat = wgl.Material.NoLight();
    const prog = wgl.Program.fromSources(renderContext.gl, terrainSources.vertex, terrainSources.fragment);
    const quadData = wgl.geometry.triangleStripQuadPositions(128);

    if (!this.useHeightMapTexture) {
      for (let i = 0; i < quadData.vertexData.length/3; i++) {
        const x = quadData.vertexData[i*3];
        const z = 1 - quadData.vertexData[i*3+2];
        quadData.vertexData[i*3+1] = this.heightMap.normalizedValueAtNormalizedXz(x, z) * this.heightScale;
      }
    }

    const vboDescriptors: Array<wgl.types.VboDescriptor> = [
      {name: 'position', attributes: [wgl.types.makeAttribute('a_position', gl.FLOAT, 3)], data: quadData.vertexData},
    ];

    const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors, wgl.types.makeAnonymousEboDescriptor(quadData.indices));
    const drawable = wgl.types.Drawable.indexed(renderContext, vao, quadData.indices.length);
    drawable.mode = gl.TRIANGLE_STRIP;
    const model = new wgl.Model(drawable, mat);

    mat.setUniformProperty('modelColor', this.color);
    model.transform.scale([this.gridScale, 1, this.gridScale]);

    this.model = model;
    this.program = prog;
    this.drawable = model.drawable;
  }

  private bindTextures(): void {
    this.renderContext.pushActiveTexture2DAndBind(this.heightMapTexture);
    this.renderContext.pushActiveTexture2DAndBind(this.skyDomeTexture);
  }

  private unbindTextures(): void {
    this.renderContext.popTexture2D();
  }

  private cullFace(): void {
    this.renderContext.gl.enable(this.renderContext.gl.CULL_FACE);
  }

  private disableCullFace(): void {
    this.renderContext.gl.disable(this.renderContext.gl.CULL_FACE);
  }

  render(view: mat4, proj: mat4, camera: wgl.ICamera, playerPosition: wgl.types.Real3, sunPosition: wgl.types.Real3, sunColor: wgl.types.Real3): void {
    this.renderContext.useProgram(this.program);
    wgl.debug.setViewProjection(this.program, view, proj);

    this.bindTextures();

    this.program.setMat4('model', this.model.transform.matrix);
    this.program.setVec3('color', this.color);
    this.program.setVec3('sun_position', sunPosition);
    this.program.setVec3('sun_color', sunColor);
    this.program.setVec3('camera_position', camera.position);
    this.program.setVec3('sky_dome_origin', playerPosition);
    this.program.set1f('sky_dome_radius', this.skyDomeRadius);

    this.program.setTexture('height_map', this.heightMapTexture.index);
    this.program.set1f('height_scale', this.heightScale);
    this.program.setTexture('sky_dome_texture', this.skyDomeTexture.index);

    this.disableCullFace();

    this.renderContext.bindVao(this.drawable.vao);
    this.drawable.draw();

    this.unbindTextures();
    this.cullFace();
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
  private frameTimer: util.Stopwatch;
  private cameraTarget: wgl.Model;
  private imageQuality: game.ImageQuality = game.ImageQuality.High;
  private movementSpeed = 0.25;

  private playerPosition = [0, 0, 0];
  private playerAabb: wgl.math.Aabb;

  private sunPosition = [50, 20, 50];
  private sunColor = [1, 1, 1];

  private terrainDrawable: TerrainDrawable;
  private terrainHeightMap: wgl.terrain.IHeightMap;
  private terrainHeightMapTexture: wgl.Texture2D;

  private lowLodTerrainGrass: TerrainGrassDrawable;
  private medLodTerrainGrass: TerrainGrassDrawable;
  private highLodTerrainGrass: TerrainGrassDrawable;
  private highestLodTerrainGrass: TerrainGrassDrawable;
  private readonly terrainHeightScale = 20;
  private readonly terrainGridScale = 200;

  private skyDome: game.SkyDomeDrawable;
  private readonly skyDomeScale = 400;

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

  private async makeSkyDome(): Promise<void> {
    const resources = new game.SkyDomeResources('/texture/sky4.png', 5e3);
    await resources.load(err => console.log(err));
  
    const skyDrawable = new game.SkyDomeDrawable();
    skyDrawable.create(this.renderer, this.renderContext, resources);
  
    skyDrawable.model.transform.translate([10, 2, 10]);
  
    this.scene.addModel(skyDrawable.model);
    this.skyDome = skyDrawable;
  }

  private async makeTerrain(): Promise<void> {
    const image = await util.loadImageObject('/texture/sphere-heightmap2.png');
    const heightMap = new wgl.terrain.ImageHeightMap(image);
    heightMap.setInterpolationExtent(0.01);
    this.terrainHeightMap = heightMap;
    this.terrainHeightMapTexture = makeHeightMapTexture(this.renderContext.gl, image);

    const heightScale = this.terrainHeightScale;
    const gridScale = this.terrainGridScale;
    const rc = this.renderContext;

    const lowLodOptions: TerrainGrassDrawableOptions = {
      gridOffset: [100, 100],
      grassGridScale: [100, 100],
      bladeScale: [2, 2, 1],
      numBladesPerDim: 200
    };

    const medLodOptions: TerrainGrassDrawableOptions = {
      gridOffset: [25, 25],
      grassGridScale: [100, 100],
      bladeScale: [0.5, 1, 1],
      numBladesPerDim: 300
    };

    const highLodOptions: TerrainGrassDrawableOptions = {
      gridOffset: [15, 15],
      grassGridScale: [50, 50],
      bladeScale: [0.2, 1, 1],
      numBladesPerDim: 300
    };

    const highestLodOptions: TerrainGrassDrawableOptions = {
      gridOffset: [0, 0],
      grassGridScale: [15, 15],
      bladeScale: [0.075, 1, 1],
      numBladesPerDim: 150
    }

    this.terrainDrawable = new TerrainDrawable(rc, heightMap, this.terrainHeightMapTexture, this.skyDome.modelColorTexture, this.skyDomeScale, gridScale, heightScale);

    this.lowLodTerrainGrass = new TerrainGrassDrawable(rc, heightMap, this.terrainHeightMapTexture, heightScale, gridScale, lowLodOptions);
    this.medLodTerrainGrass =  new TerrainGrassDrawable(rc, heightMap, this.terrainHeightMapTexture, heightScale, gridScale, medLodOptions);
    this.highLodTerrainGrass = new TerrainGrassDrawable(rc, heightMap, this.terrainHeightMapTexture, heightScale, gridScale, highLodOptions);
    this.highestLodTerrainGrass = new TerrainGrassDrawable(rc, heightMap, this.terrainHeightMapTexture, heightScale, gridScale, highestLodOptions);
  }

  private makeCamera(): wgl.FollowCamera {
    const camera = wgl.debug.makeFollowCamera(this.renderContext.gl);
    camera.rotate(Math.PI/4, -0.2);
    return camera;
  }

  private makePlayer(): void {
    const playerDims = [1.01, 2.01, 1.01];
    const player = new game.Player(playerDims);
    this.playerAabb = player.aabb;
    this.playerAabb.moveToY(0);
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
    const playerPos = this.playerPosition;
    playerPos[0] = this.playerAabb.midX();
    playerPos[1] = this.playerAabb.minY;
    playerPos[2] = this.playerAabb.midZ();

    const fracX = playerPos[0] / this.terrainDrawable.gridScale;
    const fracZ = 1 - (playerPos[2] / this.terrainDrawable.gridScale);
    const y = this.terrainHeightMap.normalizedValueAtNormalizedXz(fracX, fracZ) * this.terrainDrawable.heightScale;
    
    this.playerAabb.moveToY(y);
    playerPos[1] = y;

    this.skyDome.model.transform.identity()
    this.skyDome.model.transform.translate(playerPos);
    this.skyDome.model.transform.scale(this.skyDomeScale);
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

    this.terrainDrawable.render(view, proj, this.camera, this.playerPosition, this.sunPosition, this.sunColor);

    this.lowLodTerrainGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    this.medLodTerrainGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    this.highLodTerrainGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    this.highestLodTerrainGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
  }

  async initialize(): Promise<void> {
    await this.makeSkyDome();
    await this.makeTerrain();
  }

  update(): void {
    const dt = this.updateDt();

    this.controller.update();
    this.updatePosition();
    this.updateCamera(dt);
    this.lowLodTerrainGrass.update(dt, this.playerPosition, this.camera);
    this.highLodTerrainGrass.update(dt, this.playerPosition, this.camera);

    const view = this.camera.makeViewMatrix();
    const proj = this.camera.makeProjectionMatrix();

    this.render(view, proj);
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
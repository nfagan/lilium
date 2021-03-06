import * as wgl from '../src/gl';
import * as game from '../src/game';
import * as util from '../src/util';
import { mat4, vec3 } from 'gl-matrix';
import * as terrainSources from './shaders/debug-terrain';
import * as grassSources from './shaders/debug-terrain-grass3';
import * as grassGridSources from './shaders/debug-terrain-grass3-grid';
import { FrustumGrid } from './frustum-grid';

function makeHeightMapTexture(gl: WebGLRenderingContext, heightMapImage: util.Image): wgl.Texture2D {
  const tex = wgl.Texture2D.linearRepeatRGBA(gl, heightMapImage.width);

  tex.wrapS = gl.CLAMP_TO_EDGE;
  tex.wrapT = gl.CLAMP_TO_EDGE;
  
  tex.bindAndConfigure();
  tex.fillImage(heightMapImage.data as Uint8Array);

  return tex;
}

type TerrainGrassDrawableOptions = {
  gridScale: number,
  bladeScale: Array<number>, 
  gridOffsetZ: number,
  numBladesPerDim: number,
  frustumGridDim: number,
  frustumNearScale: number,
  aspectRatio: number,
  cameraFieldOfView: number,
  grassDensity: number,
  useDensity: boolean
}

type TerrainInfo = {
  heightMap: wgl.terrain.IHeightMap, 
  heightMapTexture: wgl.Texture2D, 
  heightScale: number, 
  terrainGridScale: number
};

class GridGrassDrawable {
  private renderContext: wgl.RenderContext;
  private readonly numSegments = 3;

  private drawable: wgl.types.Drawable;
  private program: wgl.Program;

  private numBlades: number;
  private numBladesPerCell: number;
  private numCells: number;

  private terrainInfo: TerrainInfo;
  private bladeScale: Array<number>;

  private frustumGrid: FrustumGrid;

  private readonly color = [0.5, 1, 0.5];
  private readonly options: TerrainGrassDrawableOptions;

  private noiseTexture: wgl.Texture2D;

  constructor(renderContext: wgl.RenderContext, options: TerrainGrassDrawableOptions, terrainInfo: TerrainInfo, noiseTexture: wgl.Texture2D) {
    const numCells = options.frustumGridDim * options.frustumGridDim;

    this.renderContext = renderContext;
    this.numCells = numCells;
    this.options = options;

    this.bladeScale = options.bladeScale;
    this.terrainInfo = terrainInfo;
    this.noiseTexture = noiseTexture;

    this.makeFrustumGrid(options);
    this.makeDrawable();
  }

  private makeFrustumGrid(options: TerrainGrassDrawableOptions): void {
    const offZ = options.gridOffsetZ;
    const gridScale = options.gridScale;

    const nearScale = Math.max(options.aspectRatio * Math.tan(options.cameraFieldOfView/2) * offZ, options.aspectRatio) * 2;
    const farScale = Math.max(options.aspectRatio * Math.tan(options.cameraFieldOfView/2) * (offZ + gridScale), 1) * 2;

    this.frustumGrid = new FrustumGrid(nearScale, farScale, gridScale, options.frustumGridDim, offZ);

    let numBladesPerDim: number;

    if (options.useDensity) {
      numBladesPerDim = Math.floor(options.grassDensity * this.frustumGrid.cellSize());
    } else {
      numBladesPerDim = options.numBladesPerDim;
    }
    
    this.numBladesPerCell = numBladesPerDim * numBladesPerDim;
    this.numBlades = this.numBladesPerCell * this.frustumGrid.numCells();

    console.log('Grid blades per cell: ', this.numBladesPerCell);
  }

  makeOffset(): Float32Array {
    const offsets = new Float32Array(this.numBladesPerCell * 2);

    for (let i = 0; i < this.numBladesPerCell; i++) {
      offsets[i*2] = Math.random();
      offsets[i*2+1] = Math.random();
    }

    return offsets;
  }

  makeRotation(): Float32Array {
    const rot = new Float32Array(this.numBladesPerCell);

    for (let i = 0; i < this.numBladesPerCell; i++) {
      rot[i] = Math.random() * Math.PI;
    }

    return rot;
  }

  private makeDrawable(): void {
    const gl = this.renderContext.gl;
    const prog = wgl.Program.fromSources(gl, grassGridSources.vertex, grassGridSources.fragment);
    
    const numSegments = this.numSegments;
    const numInstances = this.numBladesPerCell;
    const positions = wgl.debug.segmentedQuadPositions(numSegments);

    const vboDescriptors: Array<wgl.types.VboDescriptor> = [
      {name: 'position', attributes: [wgl.types.makeAttribute('a_position', gl.FLOAT, 3, 0)], data: positions},
      {name: 'offset', attributes: [wgl.types.makeAttribute('a_offset', gl.FLOAT, 2, 1)], data: this.makeOffset()},
      {name: 'rotation', attributes: [wgl.types.makeAttribute('a_rotation', gl.FLOAT, 1, 1)], data: this.makeRotation()},
    ];

    const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors);
    const drawable = wgl.types.Drawable.fromProperties(this.renderContext, vao, wgl.types.DrawFunctions.arraysInstanced);

    drawable.isInstanced = true;
    drawable.count = positions.length/3;
    drawable.numActiveInstances = numInstances;

    this.drawable = drawable;
    this.program = prog;
  }

  update(dt: number, camera: wgl.ICamera, playerPos: wgl.types.Real3): void {
    const currFront = vec3.create();
    camera.getFrontXz(currFront);
    const theta = Math.atan2(currFront[2], currFront[0]) + Math.PI/2;

    const pos = camera.position;

    this.frustumGrid.update(pos[0], pos[2], theta);
  }

  render(view: mat4, proj: mat4, camera: wgl.ICamera, sunPosition: wgl.types.Real3, sunColor: wgl.types.Real3): void {

    this.renderContext.useProgram(this.program);
    const gl = this.renderContext.gl;
    gl.disable(gl.CULL_FACE);

    this.noiseTexture.index = 10;
    this.noiseTexture.activateAndBind();

    wgl.debug.setViewProjection(this.program, view, proj);
    this.program.setVec3('color', this.color);
    this.program.setVec3('blade_scale', this.bladeScale);
    this.program.set1f('terrain_grid_scale', this.terrainInfo.terrainGridScale);

    this.program.set1f('frustum_cell_scale', this.frustumGrid.cellSize());
    this.program.set1f('frustum_grid_dimension', this.frustumGrid.gridDim);
    this.program.setTexture('noise_texture', this.noiseTexture.index);

    this.program.setTexture('height_map', this.terrainInfo.heightMapTexture.index);
    this.program.set1f('height_scale', this.terrainInfo.heightScale);

    const drawable = this.drawable;
    this.renderContext.bindVao(drawable.vao);

    let row = 0;
    let col = 0;

    for (let i = 0; i < this.numCells; i++) {
      row++;

      if (row === this.frustumGrid.gridDim-1) {
        row = 0;
        col++;
      }

      if (this.frustumGrid.cellIndices[i*4+2] > 0.5) {
        const cx = this.frustumGrid.cellIndices[i*4];
        const cz = this.frustumGrid.cellIndices[i*4+1];
        const alpha = this.frustumGrid.cellIndices[i*4+3];

        this.program.set2f('frustum_world_index', cx, cz);
        this.program.set2f('frustum_data_index', row, col);
        this.program.set1f('alpha', alpha);

        drawable.draw();
      }
    }

    gl.enable(gl.CULL_FACE);
  }
}

class TerrainGrassDrawable {
  private renderContext: wgl.RenderContext;
  private readonly numSegments = 3;
  private readonly numBladesPerDim: number;
  private readonly numBlades: number;
  private readonly bladeScale: Array<number>;
  private readonly color = [0.5, 1, 0.5];
  private readonly maxNumBladesPerDim = 400;

  private readonly USE_DENSITY: boolean;

  private gridOffsetZ: number;
  private gridScale: number;

  private frustumGrid: FrustumGrid;
  private frustumGridTexture: wgl.Texture2D;

  private rotations: Float32Array;
  private translations: Float32Array;
  private frustumGridUv: Float32Array;

  private program: wgl.Program;
  private drawable: wgl.types.Drawable;

  private terrainInfo: TerrainInfo;

  constructor(renderContext: wgl.RenderContext, options: TerrainGrassDrawableOptions, terrainInfo: TerrainInfo) {
    this.USE_DENSITY = options.useDensity;

    this.gridOffsetZ = options.gridOffsetZ;
    this.gridScale = options.gridScale;
    this.bladeScale = options.bladeScale.slice();

    this.renderContext = renderContext;
    this.terrainInfo = terrainInfo;

    this.makeFrustumGrid(options);

    if (this.USE_DENSITY) {
      this.numBladesPerDim = Math.max(1, Math.floor(options.grassDensity * this.frustumGrid.gridScale));
      console.log('Num blades per dim: ', this.numBladesPerDim);
      this.numBladesPerDim = Math.min(this.numBladesPerDim, this.maxNumBladesPerDim);
    } else {
      this.numBladesPerDim = options.numBladesPerDim;
    }

    this.numBlades = this.numBladesPerDim * this.numBladesPerDim;

    this.makeFrustumGridTexture();
    this.createInstanceData();
    this.initializeInstanceData();
    this.makeDrawable();
  }

  private makeFrustumGrid(options: TerrainGrassDrawableOptions): void {
    const tanFov = Math.tan(options.cameraFieldOfView/2);
    const nearScale = tanFov * options.aspectRatio * (this.gridOffsetZ + options.aspectRatio) * 2;
    const farScale = tanFov * options.aspectRatio * (this.gridOffsetZ + this.gridScale + options.aspectRatio) * 2;

    if (this.USE_DENSITY) {
      this.frustumGrid = new FrustumGrid(nearScale, farScale, this.gridScale, options.frustumGridDim, this.gridOffsetZ);
    } else {
      this.frustumGrid = new FrustumGrid(options.frustumNearScale, this.gridScale, this.gridScale, options.frustumGridDim, this.gridOffsetZ);
    }
  }

  private makeFrustumGridTexture(): void {
    const gl = this.renderContext.gl;
    const tex = new wgl.Texture2D(gl);

    tex.minFilter = gl.NEAREST;
    tex.magFilter = gl.NEAREST;
    tex.wrapS = gl.CLAMP_TO_EDGE;
    tex.wrapT = gl.CLAMP_TO_EDGE;
    tex.level = 0;
    tex.internalFormat = gl.RGBA;
    tex.width = this.frustumGrid.gridDim;
    tex.height = this.frustumGrid.gridDim;
    tex.border = 0;
    tex.srcFormat = gl.RGBA;
    tex.srcType = gl.FLOAT;

    tex.bindAndConfigure();
    tex.fillImage(this.frustumGrid.cellIndices);

    this.frustumGridTexture = tex;
  }

  private createInstanceData(): void {
    this.frustumGridUv = new Float32Array(this.numBlades*2);
    this.translations = new Float32Array(this.numBlades*2);
    this.rotations = new Float32Array(this.numBlades);
  }

  private initializeInstanceData(): void {
    for (let i = 0; i < this.numBlades; i++) {
      this.rotations[i] = Math.random() * Math.PI;

      this.translations[i*2] = Math.random();
      this.translations[i*2+1] = Math.random();

      this.frustumGridUv[i*2] = Math.random();
      this.frustumGridUv[i*2+1] = Math.random();
    }
  }

  private makeDrawable(): void {
    const gl = this.renderContext.gl;
    const prog = wgl.Program.fromSources(gl, grassSources.vertex, grassSources.fragment);
    
    const numSegments = this.numSegments;
    const numInstances = this.numBlades;
    const positions = wgl.debug.segmentedQuadPositions(numSegments);

    const vboDescriptors: Array<wgl.types.VboDescriptor> = [
      {name: 'position', attributes: [wgl.types.makeAttribute('a_position', gl.FLOAT, 3, 0)], data: positions},
      {name: 'translation', attributes: [wgl.types.makeAttribute('a_translation', gl.FLOAT, 2, 1)], data: this.translations},
      {name: 'grid_uv', attributes: [wgl.types.makeAttribute('a_frustum_grid_uv', gl.FLOAT, 2, 1)], data: this.frustumGridUv},
      {name: 'rotation', attributes: [wgl.types.makeAttribute('a_rotation', gl.FLOAT, 1, 1)], data: this.rotations}
    ];

    const vao = wgl.Vao.fromDescriptors(gl, prog, vboDescriptors);
    const drawable = wgl.types.Drawable.fromProperties(this.renderContext, vao, wgl.types.DrawFunctions.arraysInstanced);

    drawable.isInstanced = true;
    drawable.count = positions.length/3;
    drawable.numActiveInstances = numInstances;

    this.drawable = drawable;
    this.program = prog;
  }

  render(view: mat4, proj: mat4, camera: wgl.ICamera, sunPos: wgl.types.Real3, sunColor: wgl.types.Real3): void {
    const gl = this.renderContext.gl;

    this.renderContext.useProgram(this.program);
    this.renderContext.bindVao(this.drawable.vao);

    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    wgl.debug.setViewProjection(this.program, view, proj);

    this.frustumGridTexture.index = 2;
    this.frustumGridTexture.activateAndBind();

    this.terrainInfo.heightMapTexture.activateAndBind();

    this.program.setVec3('color', this.color);
    this.program.setVec3('blade_scale', this.bladeScale);

    this.program.setTexture('frustum_grid_map', this.frustumGridTexture.index);
    this.program.set1f('frustum_grid_cell_size', this.frustumGrid.cellSize());
    // this.program.set1f('frustum_z_extent', this.frustumGrid.zExtent);

    this.program.setTexture('height_map', this.terrainInfo.heightMapTexture.index);
    this.program.set1f('height_scale', this.terrainInfo.heightScale);
    this.program.set1f('terrain_grid_scale', this.terrainInfo.terrainGridScale);

    this.program.setVec3('camera_position', camera.position);
    this.program.setVec3('sun_position', sunPos);
    this.program.setVec3('sun_color', sunColor);

    this.drawable.draw();

    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }

  update(dt: number, camera: wgl.ICamera, playerPos: wgl.types.Real3): void {
    const currFront = vec3.create();
    camera.getFrontXz(currFront);
    const theta = Math.atan2(currFront[2], currFront[0]) + Math.PI/2;

    const pos = camera.position;

    this.frustumGrid.update(pos[0], pos[2], theta);
    this.frustumGridTexture.bind();
    this.frustumGridTexture.subImage(this.frustumGrid.cellIndices);
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

  private sunPosition = [10, 20, 10];
  private sunColor = [1, 1, 1];

  private terrainDrawable: TerrainDrawable;
  private terrainHeightMap: wgl.terrain.IHeightMap;
  private terrainHeightMapTexture: wgl.Texture2D;

  private readonly terrainHeightScale = 20;
  private readonly terrainGridScale = 200;

  private lowLodGrass: TerrainGrassDrawable;
  private medLodGrass: TerrainGrassDrawable;
  private highLodGrass: TerrainGrassDrawable;
  private highestLodGrass: TerrainGrassDrawable;

  private medLodGridGrass: GridGrassDrawable;
  private highLodGridGrass: GridGrassDrawable;
  private isGrassPaused: boolean = false;

  private skyDome: game.SkyDomeDrawable;
  private readonly skyDomeScale = 400;

  constructor() {
    const keyboard = new wgl.Keyboard();
    this.setupDocument(keyboard);

    this.scene = new wgl.Scene();
    this.audioContext = new ((<any>window).webkitAudioContext || window.AudioContext)();
    this.renderContext = new wgl.RenderContext(this.makeContext());
    this.camera = this.makeCamera();
    this.keyboard = keyboard;
    this.renderer = new wgl.Renderer(this.renderContext);
    this.controller = this.makeController(this.keyboard);
    this.frameTimer = new util.Stopwatch();
    
    this.makePlayer();
  }

  private makeWorldBoundsModels(drawable: wgl.types.Drawable): void {
    const mat = wgl.Material.NoLight();
    const numPerDim = 20;

    for (let i = 0; i < numPerDim; i++) {
      for (let j = 0; j < numPerDim; j++) {
        const xFrac = i / (numPerDim-1);
        const zFrac = j / (numPerDim-1);

        const x = xFrac * this.terrainGridScale;
        const z = zFrac * this.terrainGridScale;

        const cubeModel = new wgl.Model(drawable, mat);
        const h = this.terrainHeightMap.normalizedValueAtNormalizedXz(xFrac, 1-zFrac) * this.terrainHeightScale;
        cubeModel.transform.translate([x, h, z]);
        cubeModel.transform.scale([0.5, 1, 0.5]);
        this.scene.addModel(cubeModel);
      }
    }
  }

  private makeDebugCubes(): void {
    const mat = wgl.Material.NoLight();
    mat.setUniformProperty('modelColor', [1, 1, 1]);

    const prog = this.renderer.requireProgram(mat);
    const cubeVao = wgl.factory.vao.makeCubeVao(this.renderContext.gl, prog);
    const cube = wgl.types.Drawable.indexed(this.renderContext, cubeVao.vao, cubeVao.numIndices);

    const cameraTarget = new wgl.Model(cube, wgl.Material.NoLight());
    this.cameraTarget = cameraTarget;
    this.scene.addModel(cameraTarget);

    this.makeWorldBoundsModels(cube);
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

  private makeNoiseTexture(image: util.Image): wgl.Texture2D {
    const gl = this.renderContext.gl;
    const tex = wgl.Texture2D.linearRepeatAlpha(gl, image.width);
    // tex.minFilter = gl.NEAREST;
    // tex.magFilter = gl.NEAREST;

    tex.bindAndConfigure();
    tex.fillImage(image.data as Uint8Array);
    return tex;
  }

  private async makeTerrain(): Promise<void> {
    const image = await util.loadImageObject('/texture/sphere-heightmap2.png');
    const heightMap = new wgl.terrain.ImageHeightMap(image);
    heightMap.setInterpolationExtent(0.01);
    this.terrainHeightMap = heightMap;
    this.terrainHeightMapTexture = makeHeightMapTexture(this.renderContext.gl, image);

    const noiseImage = await util.loadImageObject('/texture/blue_noise_mask_256_256.png');
    const noiseTexture = this.makeNoiseTexture(noiseImage);


    //  Options should be:
    //    Tile density
    //    Tile number of tiles
    //    

    const heightScale = this.terrainHeightScale;
    const gridScale = this.terrainGridScale;
    const rc = this.renderContext;
    const fov = this.camera.getFieldOfView();

    const lowLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 50,
      gridScale: 200,
      bladeScale: [1, 1, 1],
      numBladesPerDim: 300,
      frustumGridDim: 32,
      frustumNearScale: 50,
      aspectRatio: 1,
      cameraFieldOfView: fov,
      grassDensity: 0.5,
      useDensity: false
    };

    const medLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 10,
      gridScale: 100,
      bladeScale: [0.25, 1, 1],
      numBladesPerDim: 300,
      frustumGridDim: 32,
      frustumNearScale: 40,
      aspectRatio: this.aspectRatio(),
      cameraFieldOfView: fov,
      grassDensity: 2.5,
      useDensity: true
    }

    const highLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 20,
      gridScale: 30,
      bladeScale: [0.1, 1, 1],
      numBladesPerDim: 400,
      frustumGridDim: 16,
      frustumNearScale: 5,
      aspectRatio: this.aspectRatio(),
      cameraFieldOfView: fov,
      grassDensity: 5,
      useDensity: true
    }

    const highestLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 1,
      gridScale: 30,
      bladeScale: [0.1, 1, 1],
      numBladesPerDim: 400,
      frustumGridDim: 32,
      frustumNearScale: 5,
      aspectRatio: this.aspectRatio(),
      cameraFieldOfView: fov,
      grassDensity: 10,
      useDensity: true
    }

    const terrainInfo: TerrainInfo = {
      heightMap,
      heightMapTexture: this.terrainHeightMapTexture,
      heightScale: this.terrainHeightScale,
      terrainGridScale: this.terrainGridScale
    };

    this.makeAlternativeGrass(terrainInfo, noiseTexture);

    this.lowLodGrass = new TerrainGrassDrawable(rc, lowLodOptions, terrainInfo);
    this.medLodGrass = new TerrainGrassDrawable(rc, medLodOptions, terrainInfo);
    this.highLodGrass = new TerrainGrassDrawable(rc, highLodOptions, terrainInfo);
    this.highestLodGrass = new TerrainGrassDrawable(rc, highestLodOptions, terrainInfo);

    this.terrainDrawable = new TerrainDrawable(rc, heightMap, this.terrainHeightMapTexture, this.skyDome.modelColorTexture, this.skyDomeScale, gridScale, heightScale);
  }

  private makeAlternativeGrass(terrainInfo: TerrainInfo, noiseTexture: wgl.Texture2D): void {
    const rc = this.renderContext;
    const fov = this.camera.getFieldOfView();

    const highLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 0,
      gridScale: 20,
      bladeScale: [0.1, 1, 1],
      numBladesPerDim: 10,
      frustumGridDim: 32,
      frustumNearScale: 5,
      aspectRatio: this.aspectRatio(),
      cameraFieldOfView: fov,
      grassDensity: 7,
      useDensity: true
    };

    const medLodOptions: TerrainGrassDrawableOptions = {
      gridOffsetZ: 10,
      gridScale: 10,
      bladeScale: [0.1, 1, 1],
      numBladesPerDim: 10,
      frustumGridDim: 32,
      frustumNearScale: 5,
      aspectRatio: this.aspectRatio(),
      cameraFieldOfView: fov,
      grassDensity: 5,
      useDensity: true
    }

    this.highLodGridGrass = new GridGrassDrawable(rc, highLodOptions, terrainInfo, noiseTexture);
    this.medLodGridGrass = new GridGrassDrawable(rc, medLodOptions, terrainInfo, noiseTexture);
  }

  private aspectRatio(): number {
    return this.renderContext.gl.canvas.clientWidth / this.renderContext.gl.canvas.clientHeight;
  }

  private makeCamera(): wgl.FollowCamera {
    const camera = wgl.debug.makeFollowCamera(this.renderContext.gl);
    camera.rotate(0, -0.2);
    // camera.rotate(Math.PI/4, -0.2);
    return camera;
  }

  private makePlayer(): void {
    const playerDims = [1.01, 2.01, 1.01];
    const player = new game.Player(playerDims);
    this.playerAabb = player.aabb;
    this.playerAabb.moveToY(0);
  }

  private setupDocument(keyboard: wgl.Keyboard): void {
    const mouseState = wgl.debug.makeDebugMouseState();
    wgl.debug.setupDocumentBody(mouseState);
    this.mouseState = mouseState;

    keyboard.addAnonymousListener(wgl.Keys.space, () => {
      this.isGrassPaused = !this.isGrassPaused;
    });
  }

  private makeContext(): WebGLRenderingContext {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    ['top', 'left', 'right', 'bottom'].map(t => container.style[t as any] = '0');
    container.style.margin = 'auto';

    const wAspect = 16;
    const hAspect = 9;

    const resizer = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      let newW = w;
      let newH = Math.floor(hAspect / wAspect * w);

      if (newH > h) {
        newH = h;
        newW = Math.floor(wAspect / hAspect * h);
      }

      container.style.width = `${newW}px`;
      container.style.height = `${newH}px`;
    }

    window.addEventListener('resize', e => resizer());

    resizer();
    
    // container.style.width = '100vmin';
    // container.style.height = '56.25vmin';

    document.body.appendChild(container);

    return wgl.debug.createCanvasAndContext(container).unwrap();
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

    // this.medLodGridGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    // this.highLodGridGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);

    // this.lowLodGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    // this.medLodGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);


    this.highLodGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
    this.highestLodGrass.render(view, proj, this.camera, this.sunPosition, this.sunColor);
  }

  async initialize(): Promise<void> {
    await this.makeSkyDome();
    await this.makeTerrain();
    this.makeDebugCubes();
  }

  private updateGrass(dt: number): void {
    // this.lowLodGrass.update(dt, this.camera, this.playerPosition);
    // this.medLodGrass.update(dt, this.camera, this.playerPosition);
    this.highLodGrass.update(dt, this.camera, this.playerPosition);
    this.highestLodGrass.update(dt, this.camera, this.playerPosition);

    // this.medLodGridGrass.update(dt, this.camera, this.playerPosition);
    // this.highLodGridGrass.update(dt, this.camera, this.playerPosition);
  }

  update(): void {
    const dt = this.updateDt();

    this.controller.update();
    this.updatePosition();
    this.updateCamera(dt);

    if (!this.isGrassPaused) {
      this.updateGrass(dt);
    }

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
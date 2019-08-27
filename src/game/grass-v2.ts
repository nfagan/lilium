import * as wgl from '../gl';
import * as grassSources from '../../playground/shaders/debug-grass3';
import { gameUtil } from '.';
import { mat4 } from 'gl-matrix';

abstract class GrassTextureBase {
  texture: wgl.Texture2D;

  protected renderContext: wgl.RenderContext;
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

    gameUtil.makeRandomizedIndices(this.noiseIndices, this.noiseSource.length);

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
  private readonly useHeightCondition = false;

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

    let numPixelsX = Math.ceil(textureSize * fracWidth);
    let numPixelsZ = Math.ceil(textureSize * fracDepth);

    const startPixelX = Math.floor(minX * textureSize);
    const startPixelZ = Math.floor(minZ * textureSize);

    const midPixelX = (minX + fracWidth/2) * textureSize;
    const midPixelZ = (minZ + fracDepth/2) * textureSize;

    const outOfBoundsXz = fracLocX > 1 || fracLocX < 0 || fraclocZ > 1 || fraclocZ < 0;
    const outOfBoundsY = this.useHeightCondition && (playerY < offsets[1] || playerY > bladeHeight + offsets[1]);

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
    gameUtil.makeWhiteNoiseIndices(this.noiseIndices, this.noiseSource.length);
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

export class GrassDrawable {
  private renderContext: wgl.RenderContext;
  private drawable: wgl.types.Drawable;
  private program: wgl.Program;
  private numBlades: number;
  private rotations: Float32Array;
  private translations: Float32Array;

  private numSegments = 3;
  private numBladesPerDim = 300;
  private gridScale = 30;

  private bladeScale = [0.075, 1, 1];
  private color = [0.5, 1, 0.5];
  private position = [0, 0, 0];

  private windAmount = 1;
  private localMovementAmount = 0.75;

  private cameraFront = [0, 0, 0];

  private heightMap: wgl.terrain.IHeightMap;
  private terrainHeightScale: number;

  windTexture: GrassWindTexture;
  displacementTexture: GrassDisplacementTexture;
  localMovementTexture: GrassLocalMovementTexture;

  constructor(renderContext: wgl.RenderContext, noiseSource: Float32Array, heightMap: wgl.terrain.IHeightMap, terrainHeightScale: number) {
    this.renderContext = renderContext;
    this.numBlades = this.numBladesPerDim * this.numBladesPerDim;
    this.heightMap = heightMap;
    this.terrainHeightScale = terrainHeightScale;

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
    this.translations = new Float32Array(this.numBlades*3);
  }

  private initializeInstanceData(): void {
    for (let i = 0; i < this.numBlades; i++) {
      const x = Math.random();
      const z = Math.random();

      this.rotations[i] = Math.random() * Math.PI;
      this.translations[i*3] = x * this.gridScale;
      this.translations[i*3+1] = this.heightMap.normalizedValueAtNormalizedXz(x, z) * this.terrainHeightScale;
      this.translations[i*3+2] = z * this.gridScale;
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
  }

  private toggleCullFace(on: boolean): void {
    if (on) {
      this.renderContext.gl.enable(this.renderContext.gl.CULL_FACE);
    } else {
      this.renderContext.gl.disable(this.renderContext.gl.CULL_FACE);
    }
  }

  private getCameraFrontXz(camera: wgl.ICamera): Array<number> {
    const front = this.cameraFront;
    camera.getFront(front);
    front[1] = 0;
    wgl.math.norm3(front, front);
    return front;
  }

  private getLocalMovementAngle(camera: wgl.ICamera): number {
    //  Return angle orthogonal to xz components of camera forward vector.
    const cameraFront = this.getCameraFrontXz(camera);
    const localMovementDirection = Math.atan2(cameraFront[2], cameraFront[0]) + Math.PI/2;
    return (isNaN(localMovementDirection) || !isFinite(localMovementDirection)) ? 0 : localMovementDirection;
  }

  getGridScale(): number {
    return this.gridScale;
  }

  update(dt: number, playerAabb: wgl.math.Aabb): void {
    this.windTexture.update(dt);
    this.localMovementTexture.update(dt);
    this.displacementTexture.update(dt, playerAabb, this.gridScale, 1, 1, this.position, this.bladeScale[1]);
  }

  render(view: mat4, proj: mat4, camera: wgl.ICamera, sunPos: wgl.types.Real3, sunColor: wgl.types.Real3): void {
    const localMovementDirection = this.getLocalMovementAngle(camera);

    this.windTexture.bind();
    this.localMovementTexture.bind();
    this.displacementTexture.bind();

    this.renderContext.useProgram(this.program);

    this.program.setMat4('view', view);
    this.program.setMat4('projection', proj);
    this.program.setVec3('color', this.color);

    this.program.setVec3('blade_scale', this.bladeScale);
    this.program.set1f('grid_scale', this.gridScale);
    this.program.setVec3('world_position', this.position);

    this.program.set3f('local_movement_direction', Math.cos(localMovementDirection), 0, Math.sin(localMovementDirection));
    this.program.set1f('local_movement_amount', this.localMovementAmount);
    this.program.set1f('wind_amount', this.windAmount);

    this.program.setTexture('wind_texture', this.windTexture.index());
    this.program.setTexture('local_movement_texture', this.localMovementTexture.index());
    this.program.setTexture('displacement_texture', this.displacementTexture.index());

    this.program.setVec3('sun_position', sunPos);
    this.program.setVec3('sun_color', sunColor);
    this.program.setVec3('camera_position', camera.position);

    this.toggleCullFace(false);
    this.drawInstanced();
    this.toggleCullFace(true);

    this.windTexture.unbind();
    this.localMovementTexture.unbind();
    this.displacementTexture.unbind();
  }

  private drawInstanced(): void {
    this.renderContext.bindVao(this.drawable.vao);
    this.drawable.draw();
  }
}
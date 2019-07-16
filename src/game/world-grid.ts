import { types, VoxelGrid, collision, math, geometry, Vao, Vbo, RenderContext, Program, Material, shaderBuilder, Scene, MousePicker } from '../gl';
import * as gridSources from './shaders/voxel-grid';
import { mat4, vec3 } from 'gl-matrix';

export class WorldGridComponent {
  readonly maxNumFilledCells: number;
  readonly gridCollider: collision.VoxelGridCollider;
  readonly gridCollisionResult: collision.VoxelGridCollisionResult;

  gridDrawable: WorldGridDrawable;
  voxelGrid: VoxelGrid;

  constructor(voxelGrid: VoxelGrid, gridDrawable: WorldGridDrawable, maxNumFilledCells: number) {
    this.voxelGrid = voxelGrid;
    this.gridDrawable = gridDrawable;
    this.maxNumFilledCells = maxNumFilledCells;
    this.gridCollisionResult = new collision.VoxelGridCollisionResult();
    this.gridCollider = new collision.VoxelGridCollider(voxelGrid);
  }

  fillGround(numX: number, numZ: number): void {
    const atIdx = [1, 1, 1];

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numZ; j++) {
        atIdx[0] = i;
        atIdx[1] = 0;
        atIdx[2] = j;

        this.unconditionalAddCell(atIdx);
      }
    }    
  }

  encloseSquare(dim: number, offX: number, offZ: number, height: number): void {
    const indices = [0, 0, 0];
    const grid = this.voxelGrid;

    grid.getCellIndexOf3(indices, offX, 0, offZ);

    const minX = indices[0] - 1;
    const minZ = indices[2] - 1;

    grid.getCellIndexOf3(indices, offX + dim, 0, offZ + dim);

    const maxX = indices[0];
    const maxZ = indices[2];

    const numX = maxX - minX;
    const numZ = maxZ - minZ;

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < height; j++) {
        indices[0] = i + minX;
        indices[1] = 1 + j;
        indices[2] = minZ;
        this.unconditionalAddCell(indices);

        indices[2] = maxZ;
        this.unconditionalAddCell(indices);
      }
    }

    for (let i = 0; i < numZ; i++) {
      for (let j = 0; j < height; j++) {
        indices[0] = minX;
        indices[1] = 1 + j;
        indices[2] = i + minZ;
        this.unconditionalAddCell(indices);

        indices[0] = maxX;
        this.unconditionalAddCell(indices);
      }
    }

    for (let i = 0; i < height; i++) {
      indices[0] = maxX;
      indices[1] = i + 1;
      indices[2] = maxZ;

      this.unconditionalAddCell(indices);
    }
  }

  private unconditionalAddCell(atIdx: types.Real3): void {
    this.addCell(atIdx, null);
  }

  addCellIfNonOverlapping(atIdx: types.Real3, withAabb: math.Aabb): boolean {
    return this.addCell(atIdx, withAabb);
  }
  
  private addCell(atIdx: types.Real3, playerAabb: math.Aabb): boolean {
    const grid = this.voxelGrid;
    
    if (!grid.isInBoundsVoxelIndex(atIdx) || grid.isFilled(atIdx)) {
      return false;
    }

    grid.markFilled(atIdx);
    //  Hack -- test to see if collision occurs with this new
    //  cell. If so, unmark it, and return.
    if (playerAabb !== null) {
      this.gridCollider.collidesWithAabb3(this.gridCollisionResult, playerAabb, 0, 0, 0);

      if (this.gridCollisionResult.collided) {
        grid.markEmpty(atIdx);
        return false;
      }
    }

    this.gridDrawable.addCell(atIdx);

    return true;

    // const currIdx = this.filledCells.length;

    // for (let i = 0; i < 3; i++) {
    //   this.filledCells.push(atIdx[i]);
    // }

    // this.sub2ind.set(grid.subToInd(atIdx), currIdx);
  }
}

export class WorldGridDrawable {
  private grid: VoxelGrid;
  private isCreated: boolean;
  private renderContext: RenderContext;
  private maxNumInstances: number;
  private drawable: types.Drawable;
  private program: Program;

  private translationVbo: Vbo;
  private colorVbo: Vbo;
  private currentCellColors: Float32Array;
  private tmpVec3: Float32Array;
  private material: Material;

  private filledIndices: Array<number>;

  constructor(grid: VoxelGrid, renderContext: RenderContext, maxNumInstances: number) {
    this.isCreated = false;
    this.grid = grid;
    this.renderContext = renderContext;
    this.maxNumInstances = maxNumInstances;
    this.material = this.makeMaterial();
    this.tmpVec3 = new Float32Array(3);
    this.filledIndices = [];
  }

  dispose(): void {
    if (this.isCreated) {
      this.drawable.vao.dispose();
      this.isCreated = false;
    }
  }

  private makeMaterial(): Material {
    const mat = Material.Physical();
    mat.setUniformProperty('ambientConstant', 2);
    return mat;
  }

  private makeProgram(gl: WebGLRenderingContext): Program {
    const mat = this.material;

    const plugInputs = shaderBuilder.physical.makeDefaultInputPlug();
    const plugOutputs = shaderBuilder.physical.makeDefaultOutputPlug();
    const fragOutput = shaderBuilder.fragColor.makeDefaultInputPlug();

    plugInputs.modelColor = types.makeConcreteComponentPlug(types.makeGLSLVariable('v_color', 'vec3'), types.ShaderDataSource.Varying);
    plugOutputs.modelColor.connectTo(fragOutput.modelColor);

    const fragSchema = types.ShaderSchema.Fragment();
    shaderBuilder.physical.applyComponent(fragSchema, mat, plugInputs, plugOutputs);
    shaderBuilder.fragColor.applyComponent(fragSchema, mat, fragOutput);

    const fragSource = shaderBuilder.common.shaderSchemaToString(fragSchema);
    
    const prog = Program.fromSources(gl, gridSources.vertex, fragSource);

    mat.removeUnusedUniforms(prog);

    return prog;
  }

  addCell(atIdx: types.Real3): void {
    for (let i = 0; i < 3; i++) {
      this.filledIndices.push(atIdx[i]);
    }
  }

  private requireTmpArray(withSize: number): Float32Array {
    if (withSize !== 3) {
      return new Float32Array(withSize);
    } else {
      return this.tmpVec3;
    }
  }

  updateNewCells(): void {
    const numFilled = this.grid.countFilled();
    const numActiveInstances = this.drawable.numActiveInstances;
    const numToUpdate = numFilled - numActiveInstances;

    if (numToUpdate === 0) {
      return;
    }

    console.log(`Updating ${numToUpdate}; numActive: ${numActiveInstances}`);

    const offsetFilled = numActiveInstances * 3;
    const byteOffset = offsetFilled * Float32Array.BYTES_PER_ELEMENT;

    const cellDims = this.grid.cellDimensions;
    const gridPos = this.grid.position;

    const tmpArray = this.requireTmpArray(numToUpdate * 3);
    const filled = this.filledIndices;
    const gl = this.renderContext.gl;

    for (let i = 0; i < numToUpdate; i++) {
      for (let j = 0; j < 3; j++) {
        const linearIdx = i*3 + j;
        const minDim = filled[linearIdx + offsetFilled] * cellDims[j] + gridPos[j];
        const midDim = minDim + cellDims[j]/2;
        tmpArray[linearIdx] = midDim;
      }
    }

    this.renderContext.bindVbo(this.translationVbo);
    this.translationVbo.subData(gl, tmpArray, byteOffset);
  
    for (let i = 0; i < numToUpdate; i++) {  
      tmpArray[i*3+0] = 1;
      tmpArray[i*3+1] = 1;
      tmpArray[i*3+2] = 1;
    }

    this.renderContext.bindVbo(this.colorVbo);
    this.colorVbo.subData(gl, tmpArray, byteOffset);
    this.drawable.numActiveInstances = numFilled;
    this.currentCellColors = tmpArray;
  }

  draw(view: mat4, proj: mat4, camPos: types.Real3, scene: Scene): void {
    const cellDims = this.grid.cellDimensions;
    const mat = this.material;
    const prog = this.program;

    this.renderContext.useProgram(prog);
    mat.setUniforms(prog);

    prog.setMat4('view', view);
    prog.setMat4('projection', proj);
    prog.setVec3('camera_position', camPos);
    prog.set3f('scale', cellDims[0]/2, cellDims[1]/2, cellDims[2]/2);

    for (let i = 0; i < scene.lights.length; i++) {
      scene.lights[i].setUniforms(prog);
    }

    this.renderContext.bindVao(this.drawable.vao);
    this.drawable.draw();
  }

  create(): void {
    if (this.isCreated) {
      this.dispose();
    }

    const renderContext = this.renderContext;
    const gl = renderContext.gl;
    const maxNumInstances = this.maxNumInstances;

    const interleavedData = geometry.cubeInterleavedPositionsNormals();
    const indices = geometry.cubeIndices();

    const emptyFloatArray = new Float32Array(maxNumInstances * 3); //  * (x, y, z) or (r, g, b)
    const prog = this.makeProgram(gl);

    const vboDescriptors = [{
      name: 'position',
      attributes: [types.makeAttribute('a_position', gl.FLOAT, 3, 0), types.makeAttribute('a_normal', gl.FLOAT, 3, 0)],
      data: interleavedData
    },
    {name: 'color', attributes: [types.makeAttribute('a_color', gl.FLOAT, 3, 1)], data: emptyFloatArray},
    {name: 'translation', attributes: [types.makeAttribute('a_translation', gl.FLOAT, 3, 1)], data: emptyFloatArray}];
  
    const eboDescriptor = types.makeAnonymousEboDescriptor(indices);
  
    const vao = Vao.fromDescriptors(gl, prog, vboDescriptors, eboDescriptor);

    const drawable = new types.Drawable(renderContext, vao, (rc, drawable) => {
      const mode = drawable.mode;
      const count = drawable.count;
      const type = drawable.type;
      const numInstances = drawable.numActiveInstances;
      const offset = drawable.offset;

      rc.extInstancedArrays.drawElementsInstancedANGLE(mode, count, type, offset, numInstances);
    });
    
    drawable.mode = gl.TRIANGLES;
    drawable.count = indices.length;
    drawable.type = gl.UNSIGNED_SHORT;
    drawable.offset = 0;
    drawable.numActiveInstances = 0;
    drawable.isInstanced = true;

    this.translationVbo = vao.getVbo('translation');
    this.colorVbo = vao.getVbo('color');
  
    this.drawable = drawable;
    this.program = prog;
  }
}

export class WorldGridManipulator {
  private mousePicker: MousePicker;
  private mouseRayDirection: Array<number>;
  private gridComponent: WorldGridComponent;
  private selectedCellIdx: Array<number>;
  private selected: boolean;
  private added: boolean;

  constructor(gridComponent: WorldGridComponent) {
    this.gridComponent = gridComponent;
    this.mousePicker = new MousePicker();
    this.mouseRayDirection = [0, 0, 0];
    this.selectedCellIdx = [0, 0, 0];
    this.selected = false;
    this.added = false;
  }

  madeSelection(): boolean {
    return this.selected;
  }

  madeAddition(): boolean {
    return this.added;
  }

  clearSelection(): void {
    this.selected = false;
  }

  clearAddition(): void {
    this.added = false;
  }

  updateAddition(dx: number, dy: number, playerAabb: math.Aabb): void {
    if (!this.selected) {
      console.warn('No cell yet selected.');
      return;
    }

    const cellIdx = this.selectedCellIdx;
    cellIdx[1]++;
    this.added = this.gridComponent.addCellIfNonOverlapping(cellIdx, playerAabb);
  }

  updateSelection(x: number, y: number, w: number, h: number, view: mat4, proj: mat4, camPos: vec3): void {
    this.mousePicker.ray(this.mouseRayDirection, x, y, view, proj, w, h);

    const cellIdx = this.selectedCellIdx;
    const grid = this.gridComponent.voxelGrid;
    const intersects = grid.intersectingCell(cellIdx, camPos, this.mouseRayDirection);

    if (!intersects) {
      return;
    }

    this.selected = true;
  }
}
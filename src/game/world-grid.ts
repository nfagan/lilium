import { types, VoxelGrid, collision, math, geometry, Vao, Vbo, RenderContext, Program, Material, shaderBuilder, Scene } from '../gl';
import * as gridSources from './shaders/voxel-grid';
import { mat4 } from 'gl-matrix';

export class WorldGridComponent {
  gridDrawable: WorldGridDrawable;
  worldGrid: WorldGrid;

  constructor(worldGrid: WorldGrid, gridDrawable: WorldGridDrawable) {
    this.worldGrid = worldGrid;
    this.gridDrawable = gridDrawable;
  }

  fillGround(numX: number, numZ: number): void {
    const atIdx = [1, 1, 1];

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numZ; j++) {
        atIdx[0] = i;
        atIdx[1] = 0;
        atIdx[2] = j;

        this.worldGrid.unconditionalAddCell(atIdx);
        this.gridDrawable.addCell(atIdx);
      }
    }    
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
  private tmpVec3: Float32Array;
  private material: Material;

  private filledIndices: Array<number>;

  constructor(grid: VoxelGrid, renderContext: RenderContext, maxNumInstances: number) {
    this.isCreated = false;
    this.grid = grid;
    this.renderContext = renderContext;
    this.maxNumInstances = maxNumInstances;
    this.material = Material.Physical();
    this.tmpVec3 = new Float32Array(3);
    this.filledIndices = [];
  }

  dispose(): void {
    if (this.isCreated) {
      this.drawable.vao.dispose();
      this.isCreated = false;
    }
  }

  private makeProgram(gl: WebGLRenderingContext): Program {
    const mat = this.material;

    const plugInputs = shaderBuilder.physical.makeInputPlugDefaults();
    plugInputs.modelColor.source.identifier = 'v_color';
    plugInputs.modelColor.sourceType = types.ShaderDataSource.Varying;

    const fragSchema = new types.ShaderSchema(types.Shader.Fragment);
    shaderBuilder.physical.applyComponent(fragSchema, mat, plugInputs);

    const fragSource = shaderBuilder.shaderSchemaToString(fragSchema);
    console.log(fragSource);
    
    // const prog = Program.fromSources(gl, gridSources.vertex, gridSources.fragment);
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

  update(): void {
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
      tmpArray[i*3+0] = 0;
      tmpArray[i*3+1] = 0.45;
      tmpArray[i*3+2] = 0.02;
    }

    this.colorVbo.bind(gl);
    this.colorVbo.subData(gl, tmpArray, byteOffset);
    this.drawable.numActiveInstances = numFilled;
  }

  draw(view: mat4, proj: mat4, camPos: types.Real3, scene: Scene): void {
    const cellDims = this.grid.cellDimensions;

    this.material.setUniformProperty('roughness', 2);
    this.material.setUniformProperty('metallic', 0);

    this.renderContext.useProgram(this.program);
    this.material.setUniforms(this.program);

    this.program.setMat4('view', view);
    this.program.setMat4('projection', proj);
    this.program.setVec3(types.DefaultShaderIdentifiers.uniforms.cameraPosition, camPos);

    this.program.set3f('scale', cellDims[0]/2, cellDims[1]/2, cellDims[2]/2);

    for (let i = 0; i < scene.lights.length; i++) {
      scene.lights[i].setUniforms(this.program);
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
  
    const eboDescriptor = {name: 'indices', indices};
  
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

export class WorldGrid {
  voxelGrid: VoxelGrid;
  readonly maxNumFilledCells: number;

  private gridCollisionResult: collision.VoxelGridCollisionResult;
  private gridCollider: collision.VoxelGridCollider;

  private sub2ind: Map<number, number>;

  // grid: grid,
  //   gridCollisionResult: new collision.VoxelGridCollisionResult(),
  //   gridCollider: new collision.VoxelGridCollider(grid),
  //   maxNumCells,
  //   filled: [],
  //   colors: [],
  //   sub2ind: new Map<number, number>(),
  //   lastLinearInd: null,
  //   lastVoxel: [],
  //   lastColor: []
  
  constructor(voxelGrid: VoxelGrid, maxNumFilledCells: number) {
    this.voxelGrid = voxelGrid;
    this.maxNumFilledCells = maxNumFilledCells;
    this.gridCollisionResult = new collision.VoxelGridCollisionResult();
    this.gridCollider = new collision.VoxelGridCollider(voxelGrid);
    this.sub2ind = new Map<number, number>();
  }

  unconditionalAddCell(atIdx: types.Real3): void {
    this.addCell(atIdx, null);
  }

  addCellIfNonOverlapping(atIdx: types.Real3, withAabb: math.Aabb): void {
    this.addCell(atIdx, withAabb);
  }
  
  private addCell(atIdx: types.Real3, playerAabb: math.Aabb): void {
    const grid = this.voxelGrid;
    
    if (!grid.isInBoundsVoxelIndex(atIdx) || grid.isFilled(atIdx)) {
      return;
    }

    grid.markFilled(atIdx);
    //  Hack -- test to see if collision occurs with this new
    //  cell. If so, unmark it, and return.
    if (playerAabb !== null) {
      this.gridCollider.collidesWithAabb3(this.gridCollisionResult, playerAabb, 0, 0, 0);

      if (this.gridCollisionResult.collided) {
        grid.markEmpty(atIdx);
        return;
      }
    }

    // const currIdx = this.filledCells.length;

    // for (let i = 0; i < 3; i++) {
    //   this.filledCells.push(atIdx[i]);
    // }

    // this.sub2ind.set(grid.subToInd(atIdx), currIdx);
  }
}
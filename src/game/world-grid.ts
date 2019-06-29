import { types, VoxelGrid, collision, math, geometry, Vao, Vbo, RenderContext, Program } from '../gl';
import * as gridSources from './shaders/voxel-grid';

export class WorldGridDrawable {
  private isCreated: boolean;
  private renderContext: RenderContext;
  private maxNumInstances: number;
  private drawable: types.Drawable;
  private program: Program;

  private translationVbo: Vbo;
  private colorVbo: Vbo;

  constructor(renderContext: RenderContext, maxNumInstances: number) {
    this.isCreated = false;
    this.renderContext = renderContext;
    this.maxNumInstances = maxNumInstances;
  }

  dispose(): void {
    if (this.isCreated) {
      this.drawable.vao.dispose();
      this.isCreated = false;
    }
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
    const prog = Program.fromSources(gl, gridSources.vertex, gridSources.fragment);

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
  private maxNumFilledCells: number;

  private gridCollisionResult: collision.VoxelGridCollisionResult;
  private gridCollider: collision.VoxelGridCollider;

  private filledCells: Array<number>;
  private cellColors: Array<number>;

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

    this.filledCells = [];
    this.cellColors = [];

    this.sub2ind = new Map<number, number>();
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

    const currIdx = this.filledCells.length;

    for (let i = 0; i < 3; i++) {
      this.filledCells.push(atIdx[i]);
      this.cellColors.push(Math.random());
    }

    this.sub2ind.set(grid.subToInd(atIdx), currIdx);
  }
}
import { vec2 } from 'gl-matrix';

function markFilledWith(a: Array<Array<number>>, x: number, z: number, assign: number): void {
  if (a[x] === undefined) {
    a[x] = [];
  }

  a[x][z] = assign;
}

function getFilledWith(a: Array<Array<number>>, x: number, z: number): number {
  if (a[x] === undefined) {
    return -1;
  }

  const res = a[x][z];
  return res === undefined ? -1 : res;
}

function unmarkFilled(a: Array<Array<number>>, x: number, z: number): void {
  if (a[x] === undefined) {
    a[x] = [];
  }

  a[x][z] = -1;
}

function satIntersects(cx0: number, cx1: number, cz0: number, cz1: number, nx: number, nz: number, 
  trap0: number, trap1: number, trap2: number, trap3: number): boolean {
  const proj00 = cx0 * nx + cz0 * nz;
  const proj01 = cx0 * nx + cz1 * nz;
  const proj10 = cx1 * nx + cz0 * nz;
  const proj11 = cx1 * nx + cz1 * nz;

  //  Profile before removing if statements -- on safari 12.1, Math.min / max are 50% slower!

  //  Min cell
  let minCell = proj00;

  if (proj01 < minCell) {
    minCell = proj01;
  }
  if (proj10 < minCell) {
    minCell = proj10;
  }
  if (proj11 < minCell) {
    minCell = proj11;
  }

  //  Max cell
  let maxCell = proj11;

  if (proj00 > maxCell) {
    maxCell = proj00;
  }
  if (proj01 > maxCell) {
    maxCell = proj01;
  }
  if (proj10 > maxCell) {
    maxCell = proj10;
  }

  //  Min trap
  let minTrap = trap0;

  if (trap1 < minTrap) {
    minTrap = trap1;
  }
  if (trap2 < minTrap) {
    minTrap = trap2;
  }
  if (trap3 < minTrap) {
    minTrap = trap3;
  }

  //  Max trap
  let maxTrap = trap0;
  
  if (trap1 > maxTrap) {
    maxTrap = trap1;
  }
  if (trap2 > maxTrap) {
    maxTrap = trap2;
  }
  if (trap3 > maxTrap) {
    maxTrap = trap3;
  }

  // const minCell = Math.min(proj00, proj01, proj10, proj11);
  // const maxCell = Math.max(proj00, proj01, proj10, proj11);

  // const minTrap = Math.min(trap0, trap1, trap2, trap3);
  // const maxTrap = Math.max(trap0, trap1, trap2, trap3);

  return !(maxCell < minTrap || minCell > maxTrap);
}

export class FrustumGrid {
  readonly nearScale: number;
  readonly farScale: number;
  readonly zExtent: number;
  readonly gridDim: number;
  readonly zOffset: number;
  readonly gridScale: number;

  alphaRiseFactor: number = 0.1;
  alphaDecayFactor: number = 0.01;

  private readonly n0: vec2;
  private readonly n1: vec2;
  private readonly f0: vec2;
  private readonly f1: vec2;

  readonly cellIndices: Float32Array;
  private readonly inUseSubToInd: Array<Array<number>>;

  private availableIndices: Set<number>;
  private lastUsedIndices: Set<number>;
  private decayingIndices: Set<number>;

  // private readonly availableIndices: Int32Array;
  // private numAvailableIndices: number;
  // private readonly currentUsedIndices: Int8Array;
  // private readonly lastUsedIndices: Int8Array;
  // private readonly decayingIndices: Int8Array;

  private normalX0: vec2;
  private normalX1: vec2;
  private normalZ: vec2;

  private lastX: number = NaN;
  private lastZ: number = NaN;
  private lastTheta: number = NaN;

  //  Debug render.
  private cellColors: Float32Array;

  constructor(nearScale: number, farScale: number, zExtent: number, gridDim: number, zOffset: number) {
    this.nearScale = nearScale;
    this.farScale = farScale;
    this.zExtent = zExtent;
    this.gridDim = gridDim;
    this.zOffset = zOffset;

    this.n0 = vec2.create();
    this.n1 = vec2.create();
    this.f0 = vec2.create();
    this.f1 = vec2.create();

    this.f0[1] = zOffset + zExtent;

    this.f1[0] = this.farScale;
    this.f1[1] = zOffset + zExtent;

    const amountOffset = (farScale - nearScale) / 2;

    this.n0[0] = amountOffset;
    this.n0[1] = zOffset;
    this.n1[0] = amountOffset + nearScale;
    this.n1[1] = zOffset;

    this.normalX0 = vec2.fromValues(-1, 0);
    this.normalX1 = vec2.fromValues(1, 0);
    this.normalZ = vec2.fromValues(0, 1);

    this.gridScale = Math.max(farScale, nearScale, zExtent);

    this.inUseSubToInd = [];
    this.lastUsedIndices = new Set();
    this.availableIndices = new Set();
    this.decayingIndices = new Set();

    const numCells = this.gridDim * this.gridDim;

    // this.currentUsedIndices = new Int8Array(numCells);
    // this.lastUsedIndices = new Int8Array(numCells);
    // this.availableIndices = new Int32Array(numCells);
    // this.decayingIndices = new Int8Array(numCells);
    // this.currentUsedIndices.fill(-1);
    // this.lastUsedIndices.fill(-1);
    // this.decayingIndices.fill(-1);
    // this.numAvailableIndices = numCells;

    this.cellIndices = new Float32Array(numCells * 4);
    this.makeGrid();
  }

  numCells(): number {
    return this.gridDim * this.gridDim;
  }

  originX(): number {
    return this.cellIndex(this.minX());
  }

  originZ(): number {
    return this.cellIndex(this.minZ());    
  }

  private cellIndex(pos: number): number {
    return Math.floor(pos / this.cellSize());
  }

  private minX(): number {
    return Math.min(this.n0[0], this.n1[0], this.f0[0], this.f1[0]);
  }

  private minZ(): number {
    return Math.min(this.n0[1], this.n1[1], this.f0[1], this.f1[1]);
  }

  private maxX(): number {
    return Math.max(this.n0[0], this.n1[0], this.f0[0], this.f1[0]);
  }

  private maxZ(): number {
    return Math.max(this.n0[1], this.n1[1], this.f0[1], this.f1[1]);
  }

  private makeGrid(): void {
    this.cellColors = new Float32Array(this.gridDim * this.gridDim * 3);

    let index = 0;

    for (let i = 0; i < this.gridDim; i++) {
      for (let j = 0; j < this.gridDim; j++) {
        this.cellIndices[index*4] = i;
        this.cellIndices[index*4+1] = j;
        this.availableIndices.add(index);
        // this.availableIndices[index] = index;
        index++;
      }
    }
  }

  private setPositionRotation(x: number, z: number, theta: number): void {
    const amountOffset = (this.farScale - this.nearScale) / 2;

    const ct = Math.cos(theta);
    const st = Math.sin(theta);

    const f0x = -this.farScale/2;
    const f0z = this.zExtent + this.zOffset;

    const f1x = this.farScale/2;
    const f1z = this.zExtent + this.zOffset;

    const n0x = -this.farScale/2 + amountOffset;
    const n0z = this.zOffset;

    const n1x = this.farScale/2 - amountOffset;
    const n1z = this.zOffset;

    this.f0[0] = x + (f0x * ct - f0z * st);
    this.f0[1] = z + (f0z * ct + f0x * st);

    this.f1[0] = x + (f1x * ct - f1z * st);
    this.f1[1] = z + (f1z * ct + f1x * st);

    this.n0[0] = x + (n0x * ct - n0z * st);
    this.n0[1] = z + (n0z * ct + n0x * st);

    this.n1[0] = x + (n1x * ct - n1z * st);
    this.n1[1] = z + (n1z * ct + n1x * st);
  }

  cellSize(): number {
    return this.gridScale / this.gridDim;
  }

  private makeNormal(v2: vec2, p1: vec2, p0: vec2): void {
    vec2.sub(v2, p1, p0);
    vec2.normalize(v2, v2);

    const tmp = v2[0];
    v2[0] = v2[1];
    v2[1] = -tmp;
  }

  private updateNormals(): void {
    this.makeNormal(this.normalX0, this.n0, this.f0);
    this.makeNormal(this.normalX1, this.f1, this.n1);
    this.makeNormal(this.normalZ, this.n1, this.n0);
  }

  update(xPos: number, zPos: number, theta: number): void {
    this.setPositionRotation(xPos, zPos, theta);

    const eps = 0.0001;
    const isSameRotation = Math.abs(this.lastTheta - theta) < eps;
    const isSamePos = Math.abs(this.lastX - xPos) < eps && Math.abs(this.lastZ - zPos) < eps;

    this.lastX = xPos;
    this.lastZ = zPos;
    this.lastTheta = theta;

    const cellSize = this.cellSize();
    const alphaDecay = isSameRotation ? this.alphaDecayFactor : 1;
    const alphaRise = isSameRotation ? this.alphaRiseFactor : 1;

    const minX = this.minX();
    const minZ = this.minZ();
    const maxX = this.maxX();
    const maxZ = this.maxZ();

    const iMinX = this.cellIndex(minX);
    const iMinZ = this.cellIndex(minZ);
    const iMaxX = this.cellIndex(maxX);
    const iMaxZ = this.cellIndex(maxZ);

    const normX0 = this.normalX0;
    const normX1 = this.normalX1;
    const normZ = this.normalZ;

    this.updateNormals();

    const trap00 = this.n0[0] * normZ[0] + this.n0[1] * normZ[1];
    const trap10 = this.n1[0] * normZ[0] + this.n1[1] * normZ[1];
    const trap20 = this.f1[0] * normZ[0] + this.f1[1] * normZ[1];
    const trap30 = this.f0[0] * normZ[0] + this.f0[1] * normZ[1];

    const trap01 = this.n0[0] * -normZ[0] + this.n0[1] * -normZ[1];
    const trap11 = this.n1[0] * -normZ[0] + this.n1[1] * -normZ[1];
    const trap21 = this.f1[0] * -normZ[0] + this.f1[1] * -normZ[1];
    const trap31 = this.f0[0] * -normZ[0] + this.f0[1] * -normZ[1];

    const trap02 = this.n0[0] * normX0[0] + this.n0[1] * normX0[1];
    const trap12 = this.n1[0] * normX0[0] + this.n1[1] * normX0[1];
    const trap22 = this.f1[0] * normX0[0] + this.f1[1] * normX0[1];
    const trap32 = this.f0[0] * normX0[0] + this.f0[1] * normX0[1];

    const trap03 = this.n0[0] * normX1[0] + this.n0[1] * normX1[1];
    const trap13 = this.n1[0] * normX1[0] + this.n1[1] * normX1[1];
    const trap23 = this.f1[0] * normX1[0] + this.f1[1] * normX1[1];
    const trap33 = this.f0[0] * normX1[0] + this.f0[1] * normX1[1];

    const spanX = iMaxX - iMinX;
    const spanZ = iMaxZ - iMinZ;

    // const currentUsedIndices = this.currentUsedIndices;
    // currentUsedIndices.fill(-1);

    const currentUsedIndices = new Set<number>();

    const availableIndices = this.availableIndices;
    const lastUsedIndices = this.lastUsedIndices;
    const inUseSubToInd = this.inUseSubToInd;
    const decayingIndices = this.decayingIndices;

    const rawAvailableIndices = availableIndices.values();

    for (let i = 0; i <= spanX; i++) {
      for (let j = 0; j <= spanZ; j++) {
        const ix0 = (iMinX + i);
        const iz0 = (iMinZ + j);
        
        const x0 = ix0 * cellSize;
        const z0 = iz0 * cellSize;
        const x1 = x0 + cellSize;
        const z1 = z0 + cellSize;
        
        const outOfBoundingBox = x1 < minX || z1 < minZ || x0 > maxX || z0 > maxZ;
        let intersects = !outOfBoundingBox;

        if (intersects) {
          intersects = intersects && satIntersects(x0, x1, z0, z1, normZ[0], normZ[1], trap00, trap10, trap20, trap30);
          intersects = intersects && satIntersects(x0, x1, z0, z1, -normZ[0], -normZ[1], trap01, trap11, trap21, trap31);
          intersects = intersects && satIntersects(x0, x1, z0, z1, normX0[0], normX0[1], trap02, trap12, trap22, trap32);
          intersects = intersects && satIntersects(x0, x1, z0, z1, normX1[0], normX1[1], trap03, trap13, trap23, trap33);
        }

        if (intersects) {
          const filledValue = getFilledWith(inUseSubToInd, ix0, iz0);

          if (filledValue === -1 && availableIndices.size > 0) {
          // if (filledValue === -1 && this.numAvailableIndices > 0) {
            const freeInd = rawAvailableIndices.next().value;

            availableIndices.delete(freeInd);
            currentUsedIndices.add(freeInd);
            decayingIndices.delete(freeInd);

            // const freeInd = availableIndices[--this.numAvailableIndices];
            // currentUsedIndices[freeInd] = 1;
            // decayingIndices[freeInd] = -1;

            markFilledWith(inUseSubToInd, ix0, iz0, freeInd);

            this.cellIndices[freeInd*4] = ix0;
            this.cellIndices[freeInd*4+1] = iz0;
            this.cellIndices[freeInd*4+2] = 1;
            this.cellIndices[freeInd*4+3] = 0.01;

            this.cellColors[freeInd*3] = Math.random() * 127;
            this.cellColors[freeInd*3+1] = Math.random() * 127;
            this.cellColors[freeInd*3+2] = Math.random() * 127;

          } else if (filledValue !== -1) {
            let currAlpha = this.cellIndices[filledValue*4+3];

            if (currAlpha < 1) {
              currAlpha += alphaRise;
            }

            if (currAlpha > 1) {
              currAlpha = 1;
            }

            this.cellIndices[filledValue*4+3] = currAlpha;
            currentUsedIndices.add(filledValue);
            decayingIndices.delete(filledValue);

            // currentUsedIndices[filledValue] = 1;
            // decayingIndices[filledValue] = -1;
          }
        } else {
          const filledInd = getFilledWith(inUseSubToInd, ix0, iz0);

          if (filledInd !== -1) {
            unmarkFilled(inUseSubToInd, ix0, iz0);
            decayingIndices.add(filledInd);
            // decayingIndices[filledInd] = 1;
          }
        }
      }
    }

    lastUsedIndices.forEach(ind => {
      if (!currentUsedIndices.has(ind)) {
        const ix = this.cellIndices[ind*4];
        const iz = this.cellIndices[ind*4+1];
        availableIndices.add(ind);
        decayingIndices.add(ind);
        // this.cellIndices[ind*4+2] = 0;
        unmarkFilled(inUseSubToInd, ix, iz);
      }
    });

    decayingIndices.forEach(ind => {
      let alpha = this.cellIndices[ind*4+3];

      if (alpha > 0) {
        alpha -= alphaDecay;
      
        if (alpha < 0) {
          this.cellIndices[ind*4+2] = 0;
          alpha = 0;
          decayingIndices.delete(ind);
        }

        this.cellIndices[ind*4+3] = alpha;
      }
    });

    this.lastUsedIndices = currentUsedIndices;

    
    // const numCells = this.numCells();

    // console.log(this.numAvailableIndices);

    // for (let i = 0; i < numCells; i++) {
    //   if (lastUsedIndices[i] > 0 && currentUsedIndices[i] < 0) {
    //     const ix = this.cellIndices[i*4];
    //     const iz = this.cellIndices[i*4+1];

    //     availableIndices[this.numAvailableIndices++] = i;
    //     decayingIndices[i] = 1;
    //     unmarkFilled(inUseSubToInd, ix, iz);
    //   }
    // }

    // for (let i = 0; i < numCells; i++) {
    //   if (decayingIndices[i] > 0) {
    //     let alpha = this.cellIndices[i*4+3];

    //     if (alpha > 0) {
    //       alpha -= alphaDecay;
        
    //       if (alpha < 0) {
    //         this.cellIndices[i*4+2] = 0;
    //         alpha = 0;
    //         decayingIndices[i] = -1;
    //       }

    //       this.cellIndices[i*4+3] = alpha;
    //     }
    //   }
    // }

    // this.lastUsedIndices.set(this.currentUsedIndices);
  }

  private renderFrustum(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.n0[0], this.n0[1]);
    ctx.lineTo(this.n1[0], this.n1[1]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.n1[0], this.n1[1]);
    ctx.lineTo(this.f1[0], this.f1[1]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.f1[0], this.f1[1]);
    ctx.lineTo(this.f0[0], this.f0[1]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.f0[0], this.f0[1]);
    ctx.lineTo(this.n0[0], this.n0[1]);
    ctx.stroke();
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const cellSize = this.cellSize();
    const numCells = this.gridDim * this.gridDim;

    for (let i = 0; i < numCells; i++) {
      if (this.cellIndices[i*4+2] > 0) {
        const cx = this.cellIndices[i*4] * cellSize;
        const cz = this.cellIndices[i*4+1] * cellSize;

        const r = this.cellColors[i*3];
        const g = this.cellColors[i*3+2];
        const b = this.cellColors[i*3+1];

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.globalAlpha = this.cellIndices[i*4+3];
        ctx.fillRect(cx, cz, cellSize, cellSize);
      }
    }

    ctx.globalAlpha = 1;
  }

  private renderNormal(ctx: CanvasRenderingContext2D, tmp: vec2, p0: vec2, p1: vec2, norm: vec2, sign: number, len: number): void {
    vec2.add(tmp, p0, p1);
    tmp[0] /= 2;
    tmp[1] /= 2;

    ctx.beginPath();
    ctx.moveTo(tmp[0], tmp[1]);
    ctx.lineTo(tmp[0] + norm[0] * len * sign, tmp[1] + norm[1] * len * sign);
    ctx.stroke();
  }

  private renderNormals(ctx: CanvasRenderingContext2D): void {
    const tmp = vec2.create();
    const len = 100;

    this.renderNormal(ctx, tmp, this.n0, this.n1, this.normalZ, 1, len);
    this.renderNormal(ctx, tmp, this.f0, this.f1, this.normalZ, -1, len);
    this.renderNormal(ctx, tmp, this.f1, this.n1, this.normalX1, 1, len);
    this.renderNormal(ctx, tmp, this.f0, this.n0, this.normalX0, 1, len);
  }

  private renderOuterBox(ctx: CanvasRenderingContext2D): void {
    const ox = this.cellIndex(this.minX());
    const oz = this.cellIndex(this.minZ());

    const cellSize = this.cellSize();

    // const maxX = this.cellIndex(this.maxX());
    // const maxZ = this.cellIndex(this.maxZ());
    const maxX = ox + this.gridDim;
    const maxZ = oz + this.gridDim;
    
    const spanX = maxX - ox + 1;
    const spanZ = maxZ - oz + 1;

    ctx.beginPath();
    ctx.strokeRect(ox * cellSize, oz * cellSize, spanX * cellSize, spanZ * cellSize);
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.renderFrustum(ctx);
    this.renderGrid(ctx);
    this.renderNormals(ctx);
    this.renderOuterBox(ctx);
  }
}
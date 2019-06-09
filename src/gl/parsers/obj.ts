export class Obj {
  private readonly NUM_VERTICES_PER_FACE = 3;

  private source: string;
  private currentGroups: Array<string>;
  private numCurrentGroups: number;
  private currentSmoothGroup: string;
  private end: number;
  private tmpVertexData: Array<number>;
  private numTmpVertexComponents: number;
  private currentLine: number;

  private positionSize: number = NaN;
  private normalSize: number = NaN;
  private texCoordSize: number = NaN;

  public positions: Array<number>;
  public normals: Array<number>;
  public texCoords: Array<number>;

  public positionIndices: Array<number>;
  public normalIndices: Array<number>;
  public texCoordIndices: Array<number>;

  public groups: Array<Array<string>>;
  public numFaces: number;

  public positionGroupIndices: Array<number>;
  public normalGroupIndices: Array<number>;
  public texCoordGroupIndices: Array<number>;

  constructor(source: string) {
    this.source = source;
    this.currentGroups = [];
    this.numCurrentGroups = 0;
    this.currentSmoothGroup = '';
    this.end = source.length;
    this.tmpVertexData = [NaN, NaN, NaN, NaN];
    this.numTmpVertexComponents = 0;
    this.currentLine = 0;

    this.positions = [];
    this.normals = [];
    this.texCoords = [];
    this.positionGroupIndices = [];
    this.normalGroupIndices = [];
    this.texCoordGroupIndices = [];
    this.groups = [];

    this.positionIndices = [];
    this.normalIndices = [];
    this.texCoordIndices = [];

    this.numFaces = 0;

    this.parse();
    this.analyzeParse();
  }

  private parse(): void {
    let i = 0;

    while (i < this.end) {
      const sentinel = this.source[i];

      switch (sentinel) {
        case '#':
          i = this.consumeComment(i);
          break;
        case 'g':
          i = this.group(i);
          break;
        case 'v':
          i = this.vertexData(i);
          break;
        case 's':
          i = this.smoothGroup(i);
          break;
        case 'f':
          i = this.face(i);
          break;
        default:
          if (sentinel === '\n') {
            this.nextLine();
          }

          i = this.consumeToNextLine(i);
          break;
      }
    }
  }

  private analyzeParse(): void {
    this.numFaces = this.positionIndices.length/this.NUM_VERTICES_PER_FACE;
  }

  private consumeToNextLine(begin: number): number {
    let i = begin + 1;
    while (i < this.end && this.source[i] !== '\n') {
      i++;
    }
    if (i < this.end) {
      this.nextLine();
    }
    return (i+1);    
  }

  private consume(begin: number, expect: string, after: string): number {
    if (this.source[begin] !== expect) {
      throw new Error(`Expected "${expect}" after "${after}"; got "${this.source[begin]}".`);
    } else {
      return begin + 1;
    }
  }

  private addToCurrentGroup(name: string): void {
    if (this.currentGroups.length === this.numCurrentGroups) {
      this.currentGroups.push(name);
    } else {
      this.currentGroups[this.numCurrentGroups] = name;
    }

    this.numCurrentGroups++;
  }

  private clearCurrentGroup(): void {
    this.numCurrentGroups = 0;
  }

  private finalizeCurrentGroup(): void {
    this.groups.push(this.currentGroups.slice(0, this.numCurrentGroups));
  }

  private face(begin: number): number {
    let i = this.consume(begin+1, ' ', 'f (face)');
    let firstDigit = i;
    let componentIdx = 0;
    let numVerticesPerFace = 0;

    while (i < this.end) {
      const c = this.source[i];
      const isSeparator = c === '/' || c === ' ';
      const isTerminator = c === '\n' || i === this.end-1;

      if (c === '\n') {
        this.nextLine();
      }

      if (isSeparator || isTerminator) {
        const numDigits = i - firstDigit;

        if (numDigits === 0) {
          if (componentIdx === 0) {
            throw new Error(this.errorString('Position data cannot be empty.'));
          } else if (componentIdx === 1) {
            this.texCoordIndices.push(-1);
          } else if (componentIdx === 2) {
            this.normalIndices.push(-1);
          } else {
            throw new Error(this.errorString(`Out of range component index: ${componentIdx}.`));
          }

          componentIdx++;
          firstDigit = i + 1;

        } else {
          const substr = this.source.substr(firstDigit, i-firstDigit);
          const idx = parseInt(substr);

          if (isNaN(idx)) {
            throw new Error(this.errorString(`Non-integer face index for: "${substr}".`));
          }

          let assignedToIndices: Array<number> = null;
          let underlyingArray: Array<number> = null;
          let componentSize: number = -1;
          let componentName: string = null;

          switch (componentIdx) {
            case 0:
              componentName = 'position';
              assignedToIndices = this.positionIndices;
              underlyingArray = this.positions;
              componentSize = this.positionSize;
              break;
            case 1:
              componentName = 'texCoords';
              assignedToIndices = this.texCoordIndices;
              underlyingArray = this.texCoords;
              componentSize = this.texCoordSize;
              break;
            case 2:
              componentName = 'normal';
              assignedToIndices = this.normalIndices;
              underlyingArray = this.normals;
              componentSize = this.normalSize;
              break;
            default:
              throw new Error(this.errorString(`Out of range component index: ${componentIdx}.`));
          }

          if (isNaN(componentSize)) {
            throw new Error(this.errorString(`Expected defined ${componentName} size before face.`));
          }

          // const assignedIdx = (idx-1) * componentSize;
          const assignedIdx = (idx-1);

          if (assignedIdx < 0 || assignedIdx * componentSize >= underlyingArray.length) {
            throw new Error(this.errorString(`Out of bounds index ${assignedIdx}; max: ${underlyingArray.length}.`));
          }

          assignedToIndices.push(assignedIdx);
          firstDigit = i + 1;
          componentIdx++;
        }
      }

      if (componentIdx > 2) {
        numVerticesPerFace++;
        componentIdx = 0;
      }

      if (isTerminator) {
        break;
      }

      i++;
    }

    if (numVerticesPerFace !== this.NUM_VERTICES_PER_FACE) {
      throw new Error(this.errorString(`Expected ${this.NUM_VERTICES_PER_FACE} vertices per face; got ${numVerticesPerFace}.`));
    }

    return (i+1);
  }

  private parseVertexComponents(begin: number, kind: string, maxNumComponents: number): number {
    let i = this.consume(begin+1, ' ', kind);
    let firstDigit = i;
    let componentIdx = 0;
    this.numTmpVertexComponents = 0;

    while (i < this.end) {
      const c = this.source[i];

      if (c === ' ' || c === '\n' || i === this.end-1) {
        if (componentIdx > maxNumComponents) {
          const msg = `Expected at maximum ${maxNumComponents} components following vertex data symbol; got ${componentIdx+1}.`;
          throw new Error(this.errorString(msg));
        }

        const parsedSrc = this.source.substr(firstDigit, i-firstDigit);
        const parsedNum = parseFloat(parsedSrc);
        
        if (isNaN(parsedNum)) {
          throw new Error(this.errorString('Failed to parse float in vertex data.'));
        }

        this.tmpVertexData[componentIdx++] = parsedNum;
        this.numTmpVertexComponents++;
        firstDigit = i+1;

        if (c === '\n') {
          this.nextLine();
          return (i+1);
        }
      }

      i++;
    }

    return i;
  }

  private addRawVertexData(data: Array<number>, groupIndices: Array<number>): void {
    for (let i = 0; i < this.numTmpVertexComponents; i++) {
      data.push(this.tmpVertexData[i]);
      groupIndices.push(this.groups.length-1);
    }
  }

  private checkConsistentVertexSize(current: number, kind: string): void {
    const incoming = this.numTmpVertexComponents;

    if (isNaN(current)) {
      return;
    } else if (current !== incoming) {
      const msg = this.errorString(`Expected vertex data of type "${kind}" to have ${current} elements; ${incoming} were present.`);
      throw new Error(msg);
    }
  }

  private vertexNormal(begin: number): number {
    let i = this.parseVertexComponents(begin, 'vn (vertex normal)', 3);
    
    if (this.numTmpVertexComponents !== 3) {
      throw new Error('Expected 3 elements following "vn" symbol.');
    } else if (isNaN(this.normalSize)) {
      this.normalSize = this.numTmpVertexComponents;
    }

    this.checkConsistentVertexSize(this.normalSize, 'normals');
    this.addRawVertexData(this.normals, this.normalGroupIndices);
    return i;
  }

  private vertexPosition(begin: number): number {
    let i = this.parseVertexComponents(begin, 'v (vertex position)', 3);

    if (this.numTmpVertexComponents !== 3) {
      throw new Error('Expected 3 elements following "v" symbol.');
    } else if (isNaN(this.positionSize)) {
      this.positionSize = this.numTmpVertexComponents;
    }

    this.checkConsistentVertexSize(this.positionSize, 'positions');
    this.addRawVertexData(this.positions, this.positionGroupIndices);
    return i;
  }

  private vertexTexCoord(begin: number): number {
    let i = this.parseVertexComponents(begin, 'vt (vertex tex coord)', 2);

    if (this.numTmpVertexComponents < 2) {
      throw new Error('Expected 2 elements following "vt" symbol.');
    } else if (isNaN(this.texCoordSize)) {
      this.texCoordSize = this.numTmpVertexComponents;
    }

    this.checkConsistentVertexSize(this.texCoordSize, 'tex coords');
    this.addRawVertexData(this.texCoords, this.texCoordGroupIndices)
    return i;
  }

  private vertexData(begin: number): number {
    let i = begin + 1;

    if (i < this.end) {
      const sentinel = this.source[i];

      if (sentinel === 'n') {
        return this.vertexNormal(i);

      } else if (sentinel === 't') {
        return this.vertexTexCoord(i);

      } else if (sentinel === ' ') {
        return this.vertexPosition(i-1);

      } else {
        throw new Error(this.errorString(`Unexpected symbol following "v": "${sentinel}".`));
      }
    } else {
      throw new Error(this.errorString('Unexpected EOF after symbol "v".'));
    }
  }

  private smoothGroup(begin: number): number {
    let i = begin + 1;

    while (i < this.end && this.source[i] !== '\n') {
      i++;
    }

    return (i+1);
  }

  private group(begin: number): number {
    let i = this.consume(begin+1, ' ', 'g (group statement)');
    let lastStart = i;

    this.clearCurrentGroup();
    
    while (i < this.end) {
      const c = this.source[i];

      if (c === ' ' || c === '\n' || i === this.end-1) {
        const name = this.source.substr(lastStart, i-lastStart);
        this.addToCurrentGroup(name);
        lastStart = i+1;

        if (c === '\n') {
          this.nextLine();
          this.finalizeCurrentGroup();
          return (i+1);
        }
      }

      i++;
    }

    this.finalizeCurrentGroup();
    return i;
  }

  private nextLine(): void {
    this.currentLine++;
  }
  
  private consumeComment(begin: number): number {
    let i = begin + 1;  //  consume #
    while (i < this.end && this.source[i] !== '\n') {
      i++;
    }

    if (i < this.end) {
      this.nextLine();
    }

    return (i+1);
  }

  private errorString(msg: string): string {
    return `Line ${this.currentLine}: ${msg}`;
  }
}
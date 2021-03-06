import { Program } from './program';
import { PrimitiveTypedArray } from '../util/types';
import { types } from '.';

export class Vao {
  private static ID: number = 0;

  private gl: WebGLRenderingContext;
  private oesVaoExt: OES_vertex_array_object = null;
  private vao: WebGLVertexArrayObjectOES = null;
  private vbos: {[s: string]: Vbo};
  private ebos: {[s: string]: Ebo};
  private isBoundState: boolean;
  
  readonly id: number;

  constructor(gl: WebGLRenderingContext) {
    const oesVaoExt = gl.getExtension('OES_vertex_array_object');

    if (oesVaoExt === null) {
      throw new Error('VAOs are not supported in your browser.');
    }
    
    this.gl = gl;
    this.oesVaoExt = oesVaoExt;
    this.vao = oesVaoExt.createVertexArrayOES();
    this.vbos = {};
    this.ebos = {};
    this.id = Vao.ID++;
  }

  isBound(): boolean {
    return this.isBoundState;
  }

  bind(): void {
    this.oesVaoExt.bindVertexArrayOES(this.vao);
    this.isBoundState = true;
  }

  unbind(): void {
    this.oesVaoExt.bindVertexArrayOES(null);
    this.isBoundState = false;
  }

  getEbo(name: string): Ebo {
    const ebo = this.ebos[name];

    if (ebo === undefined || !this.ebos.hasOwnProperty(name)) {
      console.warn(`No ebo named "${name}".`);
      return null;
    }

    return ebo;
  }

  getVbo(name: string): Vbo {
    const vbo = this.vbos[name];

    if (vbo === undefined || !this.vbos.hasOwnProperty(name)) {
      console.warn(`No vbo named "${name}".`);
      return null;
    }

    return vbo;
  }

  attachVbo(name: string, vbo: Vbo) {
    if (this.vbos.hasOwnProperty(name) && this.vbos[name] !== undefined) {
      console.warn(`Vbo named "${name}" already exists; replacing ...`);
      this.vbos[name].dispose(this.gl);
    }

    this.vbos[name] = vbo;
  }

  attachEbo(name: string, ebo: Ebo) {
    if (this.ebos.hasOwnProperty(name) && this.ebos[name] !== undefined) {
      console.warn(`Ebo named "${name}" already exists; replacing ...`);
      this.ebos[name].dispose(this.gl);
    }

    this.ebos[name] = ebo;
  }

  dispose(): void {
    if (this.oesVaoExt !== null && this.vao !== null) {
      this.oesVaoExt.deleteVertexArrayOES(this.vao);
      this.vao = null;
    }

    for (let vboName in this.vbos) {
      const vbo = this.vbos[vboName];
      if (vbo !== undefined) {
        vbo.dispose(this.gl);
        this.vbos[vboName] = undefined;
      }
    }

    for (let eboName in this.ebos) {
      const ebo = this.ebos[eboName];
      if (ebo !== undefined) {
        ebo.dispose(this.gl);
        this.ebos[eboName] = undefined;
      }
    }
  }

  static fromScalarDescriptors(gl: WebGLRenderingContext, prog: Program, vboDescriptor: types.VboDescriptor, eboDescriptor?: types.EboDescriptor): Vao {
    return Vao.fromDescriptors(gl, prog, [vboDescriptor], eboDescriptor);
  }

  static fromSimpleInterleavedFloatData(gl: WebGLRenderingContext, prog: Program, data: Float32Array, attrs: Array<types.BuiltinAttribute>, 
    indices?: Uint16Array, identifiers?: types.ShaderIdentifierMap): Vao {
    const attributeDescriptors: Array<types.AttributeDescriptor> = [];

    for (let i = 0; i < attrs.length; i++) {
      attributeDescriptors.push(types.builtinAttributeToDescriptor(gl, attrs[i], identifiers));
    }

    const vboDescriptor = types.makeAnonymousVboDescriptor(attributeDescriptors, data, gl.STATIC_DRAW);
    let eboDescriptor: types.EboDescriptor = undefined;

    if (indices) {
      eboDescriptor = types.makeAnonymousEboDescriptor(indices);
    }

    return Vao.fromScalarDescriptors(gl, prog, vboDescriptor, eboDescriptor);
  }

  static fromDescriptors(gl: WebGLRenderingContext, prog: Program, vboDescriptors: Array<types.VboDescriptor>, eboDescriptor?: types.EboDescriptor): Vao {
    prog.use();

    const vao = new Vao(gl);
    vao.bind();

    for (let i = 0; i < vboDescriptors.length; i++) {
      const vboDescriptor = vboDescriptors[i];
      const attributeDescriptors = vboDescriptor.attributes;
      const vboName = vboDescriptor.name;
      const vboData = vboDescriptor.data;

      const bufferDescriptor = new types.BufferDescriptor();

      for (let j = 0; j < attributeDescriptors.length; j++) {
        bufferDescriptor.addAttribute(attributeDescriptors[j]);
      }

      bufferDescriptor.getAttributeLocations(prog);
      vao.attachVbo(vboName, new Vbo(gl, bufferDescriptor, vboData));
    }

    if (eboDescriptor !== undefined) {
      vao.attachEbo(eboDescriptor.name, new Ebo(gl, eboDescriptor.indices));
    }

    vao.unbind();
    return vao;
  }
}

export class Ebo {
  private ebo: WebGLBuffer = null;
  constructor(gl: WebGLRenderingContext, data: PrimitiveTypedArray, drawType?: number) {
    if (drawType === undefined) {
      drawType = gl.STATIC_DRAW;
    }

    const ebo = gl.createBuffer();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, drawType);

    this.ebo = ebo;
  }

  dispose(gl: WebGLRenderingContext): void {
    if (this.ebo !== null) {
      gl.deleteBuffer(this.ebo);
      this.ebo = null;
    }
  }
}

export class Vbo {
  private vbo: WebGLBuffer = null;
  private dataSize: number;
  readonly id: number;

  constructor(gl: WebGLRenderingContext, descriptor: types.BufferDescriptor, data: PrimitiveTypedArray, drawType?: number) {
    if (drawType === undefined) {
      drawType = gl.STATIC_DRAW;
    }

    const vbo = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, drawType);

    let offset = 0;
    const numComponents = descriptor.numComponents();
    const attrs = descriptor.getAttributes();

    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const numBytesForType = this.numBytes(gl, attr.type);
      const strideBytes = numComponents * numBytesForType;
      const offsetBytes = offset * numBytesForType;

      if (attr.location === -1) {
        console.warn(`Unknown attribute: "${attr.name}".`);
        continue;
      }

      gl.vertexAttribPointer(attr.location, attr.size, attr.type, false, strideBytes, offsetBytes);
      gl.enableVertexAttribArray(attr.location);

      if (attr.divisor !== undefined) {
        const ext = gl.getExtension('ANGLE_instanced_arrays');

        if (!ext) {
          gl.deleteBuffer(vbo);
          throw new Error(`Specified a divisor for attribute "${attr.name}", but instanced arrays are not supported.`);
        }

        ext.vertexAttribDivisorANGLE(attr.location, attr.divisor);
      }

      offset += attr.size;
    }
    
    this.vbo = vbo;
    this.dataSize = data.length;
    this.id = Vbo.ID++;
  }

  bind(gl: WebGLRenderingContext): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
  }

  unbind(gl: WebGLRenderingContext): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  dispose(gl: WebGLRenderingContext): void {
    if (this.vbo !== null) {
      gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }
  }

  subData(gl: WebGLRenderingContext, data: PrimitiveTypedArray, byteOffset: number = 0): void {
    const newBytes = data.length * data.BYTES_PER_ELEMENT;
    const oldBytes = this.dataSize * data.BYTES_PER_ELEMENT;

    if (newBytes + byteOffset > oldBytes) {
      throw new Error(`New data size (${newBytes + byteOffset}) is larger than old data size (${oldBytes}).`);
    }

    gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, data);
  }

  private numBytes(gl: WebGLRenderingContext, type: number) {
    switch (type) {
      case gl.FLOAT:
        return 4;
      case gl.BYTE:
        return 1;
      case gl.UNSIGNED_BYTE:
        return 1;
      default:
        console.warn(`Unrecognized gl data type: ${type}.`);
        return 0;
    }
  }

  private static ID: number = 0;
}
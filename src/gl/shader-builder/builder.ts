import * as types from '../types';
import { phong, noLight, common, vertexPosition, worldPosition, worldNormal, projectivePosition, physical, fragColor } from '.';
import { Program } from '../program';
import { Material } from '../material';
import { Stopwatch } from '../../util';

type ProgramCacheMap = {
  [key: string]: Program;
}

function generateMaterialHash(forDescriptor: types.MaterialDescriptor): string {
  const into: Array<string> = [];
  generateUniformIdentifierTypeIds(forDescriptor.uniforms, into);
  generateAdditionalPropertyIds(forDescriptor, into);
  return into.join(',');
}

function generateAdditionalPropertyIds(descriptor: types.MaterialDescriptor, into: Array<string>): void {
  const props = Object.keys(descriptor);

  for (let i = 0; i < props.length; i++) {
    const prop = props[i];

    if (descriptor.hasOwnProperty(prop) && (<any>descriptor)[prop] !== undefined) {
      const value = (<any>descriptor)[prop];
      if (typeof value === 'boolean' || typeof value === 'string') {
        into.push(`${prop},${value}`);
      }
    }
  }
}

function generateUniformIdentifierTypeIds(uniforms: {[key: string]: types.UniformValue}, into: Array<string>): void {
  for (let prop in uniforms) {
    if (uniforms[prop] !== undefined) {
      const uniform = uniforms[prop];
      into.push(`${uniform.identifier},${uniform.type}`);
    }
  }
}

function handleLightingModel(forMaterial: Material, fragSchema: types.ShaderSchema, identifiers: types.ShaderIdentifierMap): void {
  const lightingModel = forMaterial.descriptor.lightingModel;
  const fragInputPlug = fragColor.makeDefaultInputPlug(identifiers);

  if (lightingModel === types.LightingModel.Phong) {
    const inputPlug = phong.makeDefaultInputPlug(identifiers);
    const outputPlug = phong.makeDefaultOutputPlug(identifiers);
    outputPlug.modelColor.connectTo(fragInputPlug.modelColor);
    phong.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else if (lightingModel === types.LightingModel.Physical) {
    const inputPlug = physical.makeDefaultInputPlug(identifiers);
    const outputPlug = physical.makeDefaultOutputPlug(identifiers);
    outputPlug.modelColor.connectTo(fragInputPlug.modelColor);
    physical.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else if (lightingModel === types.LightingModel.None) {
    const inputPlug = noLight.makeDefaultInputPlug(identifiers);
    const outputPlug = noLight.makeDefaultOutputPlug(identifiers);
    outputPlug.modelColor.connectTo(fragInputPlug.modelColor);
    noLight.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else {
    console.warn(`Unsupported lighting model: "${forMaterial.descriptor.lightingModel}".`);
  }

  fragColor.applyComponent(fragSchema, forMaterial, fragInputPlug);
}

function handleGeometry(forMaterial: Material, vertSchema: types.ShaderSchema, fragSchema: types.ShaderSchema, identifiers: types.ShaderIdentifierMap): void {
  const needsUv = forMaterial.hasTextureUniform();
  const needsNormal = forMaterial.descriptor.lightingModel !== types.LightingModel.None;
  const needsVaryingPosition = forMaterial.descriptor.lightingModel !== types.LightingModel.None;

  const posAttr = types.makeGLSLVariable(identifiers.attributes.position, 'vec3');
  const normAttr = types.makeGLSLVariable(identifiers.attributes.normal, 'vec3');
  const uvAttr = types.makeGLSLVariable(identifiers.attributes.uv, 'vec2');

  vertSchema.requireAttribute(posAttr);

  const posVarying = types.makeGLSLVariable(identifiers.varyings.position, 'vec3');
  const normVarying = types.makeGLSLVariable(identifiers.varyings.normal, 'vec3');
  const uvVarying = types.makeGLSLVariable(identifiers.varyings.uv, 'vec2');

  if (needsVaryingPosition) {
    vertSchema.requireVarying(posVarying);
    fragSchema.requireVarying(posVarying);
  }

  if (needsNormal) {
    vertSchema.requireVarying(normVarying);
    vertSchema.requireAttribute(normAttr);
    //
    fragSchema.requireVarying(normVarying);
  }

  if (needsUv) {
    vertSchema.requireVarying(uvVarying);
    vertSchema.requireAttribute(uvAttr);
    //
    fragSchema.requireVarying(uvVarying);
  }

  const worldInput = worldPosition.makeDefaultInputPlug(identifiers);
  const worldOutput = worldPosition.makeDefaultOutputPlug(identifiers);
  //
  const normInput = worldNormal.makeDefaultInputPlug(identifiers);
  const normOutput = worldNormal.makeDefaultOutputPlug(identifiers);
  //
  const projInput = projectivePosition.makeDefaultInputPlug(identifiers);
  const projOutput = projectivePosition.makeDefaultOutputPlug(identifiers);
  //
  const vertInput = vertexPosition.makeDefaultInputPlug(identifiers);

  worldInput.position = types.makeAttributeComponentPlug(posAttr);
  worldOutput.position.connectTo(projInput.position);
  projOutput.position.connectTo(vertInput.position);

  worldPosition.applyComponent(vertSchema, worldInput, worldOutput);
  projectivePosition.applyComponent(vertSchema, projInput, projOutput);
  vertexPosition.applyComponent(vertSchema, vertInput);

  if (needsVaryingPosition) {
    common.assignToVariableOrLogError(vertSchema, posVarying, worldOutput.position);
  }

  if (needsNormal) {
    worldNormal.applyComponent(vertSchema, normInput, normOutput);
    // common.assignToVariableOrLogError(vertSchema, normVarying, normOutput.normal);
  }

  if (needsUv) {
    common.assignToVariableOrLogError(vertSchema, uvVarying, uvAttr);
  }
}

function makeProgram(gl: WebGLRenderingContext, forMaterial: Material): Program {
  const vertSchema = types.ShaderSchema.Vertex();
  const fragSchema = types.ShaderSchema.Fragment();
  const identifiers = types.DefaultShaderIdentifiers;

  handleGeometry(forMaterial, vertSchema, fragSchema, identifiers);
  handleLightingModel(forMaterial, fragSchema, identifiers);

  // console.log(common.shaderSchemaToString(vertSchema));
  // console.log(common.shaderSchemaToString(fragSchema));

  return Program.fromSchemas(gl, vertSchema, fragSchema);
}

export class ProgramBuilder {
  private gl: WebGLRenderingContext;
  private programs: ProgramCacheMap;
  private stopWatch: Stopwatch;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.programs = {};
    this.stopWatch = new Stopwatch();
  }

  private makeProgram(progHash: string, forMaterial: Material): Program {
    this.stopWatch.reset();
    const prog = makeProgram(this.gl, forMaterial);
    console.log(`Made new program in ${this.stopWatch.elapsed().toFixed(2)} ms.`);
    this.programs[progHash] = prog;
    return prog;
  }

  requireProgram(forMaterial: Material): Program {
    const programInfoHash = generateMaterialHash(forMaterial.descriptor);
    const maybeProg = this.programs[programInfoHash];
    
    if (maybeProg === undefined) {
      return this.makeProgram(programInfoHash, forMaterial);
    } else {
      console.log('Using cached program ...');
      return maybeProg;
    }
  }
}
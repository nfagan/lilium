import { RenderContext } from './render-context';
import { ProgramBuilder } from './shader-builder';
import { Material } from './material';
import { Program } from './program';
import { Scene } from './scene';
import { mat4 } from 'gl-matrix';
import { types } from '.';
import { ICamera } from './camera';
import { Texture2D } from './texture';

export class Renderer {
  identifiers: types.ShaderIdentifierMap;

  private renderContext: RenderContext;
  private programBuilder: ProgramBuilder;
  private programsByMaterialId: Map<number, Program>;
  private textureSetter: (tex: Texture2D) => void;
  private textureFinisher: (tex: Texture2D) => void;

  constructor(renderContext: RenderContext) {
    this.renderContext = renderContext;
    this.programBuilder = new ProgramBuilder(renderContext.gl);
    this.programsByMaterialId = new Map();
    this.identifiers = types.DefaultShaderIdentifiers;
    this.textureSetter = tex => textureSetter(this.renderContext, tex);
    this.textureFinisher = tex => textureFinisher(this.renderContext, tex);
  }

  render(scene: Scene, camera: ICamera, view: mat4, proj: mat4): void {
    const models = scene.models;
    const lights = scene.lights;
    const renderContext = this.renderContext;
    const identifiers = this.identifiers;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const material = model.material;
      const drawComponent = model.drawable;
      const progForMaterial = this.requireProgram(material);

      renderContext.useProgram(progForMaterial);

      if (material.descriptor.lightingModel !== 'none') {
        for (let j = 0; j < lights.length; j++) {
          lights[j].setUniforms(progForMaterial);
        }
        progForMaterial.setVec3(identifiers.uniforms.cameraPosition, camera.position);
      }

      progForMaterial.setMat4(identifiers.uniforms.model, model.transform.matrix);
      progForMaterial.setMat4(identifiers.uniforms.view, view);
      progForMaterial.setMat4(identifiers.uniforms.projection, proj);

      material.useTextures(this.textureSetter);
      material.setUniforms(progForMaterial);

      renderContext.bindVao(drawComponent.vao);
      drawComponent.draw();

      material.useTextures(this.textureFinisher);
      material.clearIsNewSchema();
    }
  }

  requireProgram(forMaterial: Material): Program {
    let progForMaterial = this.programsByMaterialId.get(forMaterial.id);

    if (progForMaterial === undefined) {
      progForMaterial = this.programBuilder.requireProgram(forMaterial);
      this.programsByMaterialId.set(forMaterial.id, progForMaterial);
    }

    return progForMaterial;
  }
}

function textureSetter(renderContext: RenderContext, texture: Texture2D): void {
  renderContext.pushActiveTexture2DAndBind(texture);
}

function textureFinisher(renderContext: RenderContext, texture: Texture2D): void {
  renderContext.popTexture2D();
}
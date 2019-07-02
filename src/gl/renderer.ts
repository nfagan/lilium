import { RenderContext } from './render-context';
import { ProgramBuilder } from './shader-builder';
import { Material } from './material';
import { Program } from './program';
import { Scene } from './scene';
import { mat4 } from 'gl-matrix';
import { types } from '.';

export class Renderer {
  identifiers: types.ShaderIdentifierMap;

  private renderContext: RenderContext;
  private programBuilder: ProgramBuilder;
  private programsByMaterialId: Map<number, Program>;

  constructor(renderContext: RenderContext) {
    this.renderContext = renderContext;
    this.programBuilder = new ProgramBuilder(renderContext.gl);
    this.programsByMaterialId = new Map();
    this.identifiers = types.DefaultShaderIdentifiers;
  }

  render(scene: Scene, view: mat4, proj: mat4): void {
    const models = scene.models;
    const lights = scene.lights;
    const renderContext = this.renderContext;
    const identifiers = this.identifiers;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const material = model.material;
      const drawComponent = model.drawable;

      let progForMaterial = this.programsByMaterialId.get(material.id);

      if (progForMaterial === undefined || material.isNewSchema()) {
        progForMaterial = this.programBuilder.requireProgram(material);
        this.programsByMaterialId.set(material.id, progForMaterial);
      }

      renderContext.useProgram(progForMaterial);

      if (material.descriptor.lightingModel !== 'none') {
        for (let j = 0; j < lights.length; j++) {
          lights[j].setUniforms(progForMaterial);
        }
      }

      progForMaterial.setMat4(identifiers.uniforms.model, model.transform.matrix);
      progForMaterial.setMat4(identifiers.uniforms.view, view);
      progForMaterial.setMat4(identifiers.uniforms.projection, proj);

      material.setUniforms(progForMaterial);
      material.clearIsNewSchema();

      renderContext.bindVao(drawComponent.vao);
      drawComponent.draw();
    }
  }

  requireProgram(forMaterial: Material): Program {
    return this.programBuilder.requireProgram(forMaterial);
  }
}
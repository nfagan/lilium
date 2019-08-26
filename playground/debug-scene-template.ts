import * as wgl from '../src/gl';
import * as game from '../src/game';
import * as util from '../src/util';
import { mat4, vec3 } from 'gl-matrix';

class Game {
  private scene: wgl.Scene;
  private renderContext: wgl.RenderContext;
  private renderer: wgl.Renderer;
  private camera: wgl.ICamera;
  private controller: game.Controller;
  private keyboard: wgl.Keyboard;
  private mouseState: wgl.debug.DebugMouseState;
  private playerAabb: wgl.math.Aabb;
  private frameTimer: util.Stopwatch;
  private cameraTarget: wgl.Model;
  private imageQuality: game.ImageQuality = game.ImageQuality.Highest;
  private movementSpeed = 0.25;

  constructor() {
    this.setupDocument();

    this.scene = new wgl.Scene();
    this.renderContext = new wgl.RenderContext(this.makeContext());
    this.camera = this.makeCamera();
    this.renderer = new wgl.Renderer(this.renderContext);
    this.keyboard = new wgl.Keyboard();
    this.controller = this.makeController(this.keyboard);
    this.frameTimer = new util.Stopwatch();

    this.makePlayer();
    this.makeDebugCubes();
  }

  private makeDebugCubes(): void {
    const mat = wgl.Material.NoLight();
    mat.setUniformProperty('modelColor', [1, 1, 1]);

    const prog = this.renderer.requireProgram(mat);
    const cubeVao = wgl.factory.vao.makeCubeVao(this.renderContext.gl, prog);
    const cube = wgl.types.Drawable.indexed(this.renderContext, cubeVao.vao, cubeVao.numIndices);
    const cubeModel = new wgl.Model(cube, mat);

    cubeModel.transform.translate([1, 1, 10]);

    const cameraTarget = new wgl.Model(cube, wgl.Material.NoLight());
    this.cameraTarget = cameraTarget;

    this.scene.addModel(cubeModel);
    this.scene.addModel(cameraTarget);
  }

  private makeCamera(): wgl.FollowCamera {
    const camera = new wgl.FollowCamera();
    camera.rotate(Math.PI/4, -Math.PI/7);
    return camera;
  }

  private makePlayer(): void {
    const playerDims = [1.01, 2.01, 1.01];
    const player = new game.Player(playerDims);
    this.playerAabb = player.aabb;
  }

  private setupDocument(): void {
    const mouseState = wgl.debug.makeDebugMouseState();
    wgl.debug.setupDocumentBody(mouseState);
    this.mouseState = mouseState;
  }

  private makeContext(): WebGLRenderingContext {
    return wgl.debug.createCanvasAndContext(document.body).unwrap();
  }

  private makeController(keyboard: wgl.Keyboard): game.Controller {
    const jumpButton = game.input.Button.bindToKey(keyboard, wgl.Keys.space);
    const directionalInput = game.input.DirectionalInput.fromKeyboard(keyboard);
    directionalInput.invertZ = true;
    const rotationalInput = new game.input.RotationalInput();
    rotationalInput.bindToMouseMove(document.body);
    rotationalInput.bindToTouchMove(document.body);
    
    return new game.Controller(jumpButton, directionalInput, rotationalInput);
  }

  private updateCamera(dt: number): void {
    const playerAabb = this.playerAabb;
    const camera = this.camera as wgl.FollowCamera;
    const target = [playerAabb.midX(), playerAabb.midY(), playerAabb.midZ()];
    wgl.debug.updateFollowCamera(dt, camera, target, this.mouseState, this.keyboard);

    this.cameraTarget.material.setUniformProperty('modelColor', [0.25, 0, 1]);
    this.cameraTarget.transform.identity();
    this.cameraTarget.transform.translate(target);
    this.cameraTarget.transform.scale(0.25);
  }

  private updatePosition(): void {
    const front = vec3.create();
    const right = vec3.create();

    this.camera.getFront(front);
    this.camera.getRight(right);
    
    front[1] = 0;
    wgl.math.norm3(front, front);
    
    const z = this.controller.directionalInput.getZ();
    const x = this.controller.directionalInput.getX();

    wgl.math.scale3(front, front, z);
    wgl.math.scale3(right, right, x);
    wgl.math.add3(front, front, right);
    wgl.math.scale3(front, front, this.movementSpeed);

    this.playerAabb.move(front);
  }

  private updateDt(): number {
    const frameTimer = this.frameTimer;
    const dt = Math.max(frameTimer.elapsedSecs(), 1/60);
    this.frameTimer.reset();
    return dt;
  }

  private render(view: mat4, proj: mat4): void {
    wgl.debug.beginRender(this.renderContext.gl, this.camera, game.getDpr(this.imageQuality));
    this.renderer.render(this.scene, this.camera, view, proj);
  }

  update(): void {
    const dt = this.updateDt();

    this.controller.update();
    this.updatePosition();
    this.updateCamera(dt);

    const view = this.camera.makeViewMatrix();
    const proj = this.camera.makeProjectionMatrix();

    this.render(view, proj);
  }
}

export function main(): void {
  const game = new Game();
  
  const updater = () => {
    window.requestAnimationFrame(updater);
    game.update();
  }

  window.requestAnimationFrame(updater);
}
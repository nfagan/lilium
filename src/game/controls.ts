import { Button, DirectionalInput } from './input';
import { PlayerMovement } from './player-movement';
import { ICamera, math } from '../gl';

export class Controller {
  jumpButton: Button;
  directionalInput: DirectionalInput;

  constructor(jumpButton: Button, directionalInput: DirectionalInput) {
    this.jumpButton = jumpButton;
    this.directionalInput = directionalInput;
  }
}

export class PlayerMoveControls {
  private playerMovement: PlayerMovement;
  private controller: Controller;
  
  private frontVector: Array<number>;
  private rightVector: Array<number>;
  private velocity: Array<number>;

  constructor(playerMovement: PlayerMovement, controller: Controller) {
    this.playerMovement = playerMovement;
    this.controller = controller;
    this.frontVector = [0, 0, 1];
    this.rightVector = [1, 0, 0];
    this.velocity = [0, 0, 0];
  }

  update(dt: number, camera: ICamera, playerAabb: math.Aabb): void {
    const controller = this.controller;
    const playerMovement = this.playerMovement;
    const velocity = this.velocity;
    const front = this.frontVector;
    const right = this.rightVector;

    if (controller.jumpButton.clearIfPressed()) {
      this.playerMovement.tryJump();
    }
  
    camera.getFront(front);
    camera.getRight(right);
    
    front[1] = 0;
    math.norm3(front, front);
    
    const z = controller.directionalInput.getZ();
    const x = controller.directionalInput.getX();

    math.scale3(front, front, z);
    math.scale3(right, right, x);
    math.add3(velocity, front, right);
    
    playerMovement.addVelocity(velocity);
    playerMovement.update(dt, playerAabb);
  }
}
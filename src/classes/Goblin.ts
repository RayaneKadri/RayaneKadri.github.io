import {
  AbstractMesh,
  AnimationGroup,
  Mesh,
  MeshBuilder,
  Quaternion,
  Ray,
  Scalar,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { Player } from './characterController';

const STATES = Object.freeze({
  STATE_IDLE: 0,
  STATE_SEARCH: 10,
  STATE_FOLLOW: 20,
  STATE_ATTACK: 30,
});

const NORMAL_SPEED = 0.1;
const SPRINT_SPEED = 0.20;

const LOOK_DISTANCE = 6;
const SENS_DISTANCE = 20;

class Goblin extends TransformNode {
  public mesh: Mesh;
  public scene: Scene;

  private _gravity: Vector3 = new Vector3();
  private _grounded: boolean = false;
  private _moveDirection: Vector3 = Vector3.Zero();
  private _deltaTime: number = 0;
  private playerPosition: Vector3 = Vector3.Zero();
  private distanceFromPlayer: number = 0;
  private states: number = STATES.STATE_IDLE;
  private nextBehaviorCheck: number = 0; // Prochaine vérification de comportement en timestamp
  private behaviorInterval: number = 2000;
  nextTargetTime: number = 0;
  targetPosition: Vector3 = Vector3.Zero();
  moveDirection: Vector3 = Vector3.Zero();
  speed: number;
  damage: number = 10;
  life: number = 20;

  private _run: AnimationGroup;
  private _idle: AnimationGroup;
  private _walk: AnimationGroup;
  private _attack: AnimationGroup;
  private _dead: AnimationGroup;

  // animation trackers
  private _currentAnim: AnimationGroup = null;
  private _prevAnim: AnimationGroup;

  constructor(scene: Scene) {
    super('goblinRoot', scene);
    this.scene = scene;
  }

  init() {
    SceneLoader.ImportMesh('', './models/goblin.glb', '', this.scene, (meshes, particleSystems, skeletons, animationGroups) => {
        this.mesh = meshes[0] as Mesh;
        this.mesh.name = 'goblin';
        this.mesh.checkCollisions = true;
        this.mesh.ellipsoid = new Vector3(0.25, 0.5, 0.25);
        this.mesh.ellipsoidOffset = new Vector3(0, 0.5, 0);

        // Setup animations after they are confirmed to be loaded
        if (animationGroups.length > 0) {
            this._run = animationGroups.find(ag => ag.name === 'Running');
            this._idle = animationGroups.find(ag => ag.name === 'Idle');
            this._walk = animationGroups.find(ag => ag.name === 'Walk');
            this._attack = animationGroups.find(ag => ag.name === 'Attack');
            this._dead = animationGroups.find(ag => ag.name === 'DEAD');
            this._setUpAnimations();
        } else {
            console.error('No animations were loaded for the goblin model.');
        }
    });
}

setAnimation(animation) {
  if (this._currentAnim !== animation) {
      if (this._currentAnim) {
          this._currentAnim.stop();
      }
      this._currentAnim = animation;
      this._currentAnim.play(true);
  }
}

private updateOrientation(): void {
  if (!this.playerPosition || !this.mesh) return;

  // Vector pointing from the goblin to the player
  let directionToPlayer = this.playerPosition.subtract(this.mesh.position);
  directionToPlayer.y = 0; // Keep the rotation on the horizontal plane
  
  
  // Calculate the angle from the goblin to the player
  let angle = Math.atan2(directionToPlayer.z, directionToPlayer.x);

  // Adjust the goblin's orientation so it directly faces the player
  // This assumes the goblin's forward direction aligns with the positive z-axis when angle is 0
  this.mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, -angle - Math.PI / 2, 0);
}






  private _setUpAnimations(): void {
    if (this._run && this._idle && this._walk && this._attack) {
      this.scene.stopAllAnimations();
      this._run.loopAnimation = true;
      this._walk.loopAnimation = true;
      this._idle.loopAnimation = true;
      this._attack.loopAnimation = true;

      // Initialize current and previous animations
      this._currentAnim = this._idle;
      this._prevAnim = this._walk;
  } else {
      console.error('Animations are not properly initialized.');
  }
  }

  private _animatePlayer(): void {
    this._currentAnim = this._idle;

    if (this._currentAnim != null && this._prevAnim !== this._currentAnim) {
      //Animations
      this._prevAnim.stop();
      this._currentAnim.play(this._currentAnim.loopAnimation);
      this._prevAnim = this._currentAnim;
    }
  }

  // Update gravity and movement
  private _updateGroundDetection(): void {
    // Raycast pour détecter le sol
    let groundPoint = this._floorRaycast(0, 0, 3); // Assurez-vous que le raycast est assez long
    if (!groundPoint.equals(Vector3.Zero())) {
      // Positionnez le gobelin au niveau du sol détecté
      this.mesh.position.y = groundPoint.y + 0.1; // Ajoutez une petite correction pour éviter l'enfoncement
      this._gravity.y = 0; // Réinitialisez la gravité
      this._grounded = true; // Le gobelin est au sol
    } else {
      // Appliquez la gravité uniquement si le gobelin n'est pas au sol
      const GRAVITY = -10;
      this._gravity = this._gravity.addInPlace(Vector3.Up().scale(this._deltaTime * GRAVITY));
      this._grounded = false; // Le gobelin n'est pas au sol
    }

    // Déplacez le gobelin en utilisant le vecteur de gravité
    this.mesh.moveWithCollisions(this._moveDirection.addInPlace(this._gravity));
  }

  // Raycast to detect the ground
  private _floorRaycast(offsetx: number, offsetz: number, raycastlen: number): Vector3 {
    // Position the raycast from the center of the mesh
    let raycastFloorPos = new Vector3(
      this.mesh.position.x + offsetx,
      this.mesh.position.y + 0.5,
      this.mesh.position.z + offsetz,
    );
    let ray = new Ray(raycastFloorPos, Vector3.Up().scale(-1), raycastlen);

    // Filter pickable meshes
    let predicate = function (mesh) {
      return mesh.isPickable && mesh.isEnabled();
    };

    // Perform the raycast and find the collision point
    let pick = this.scene.pickWithRay(ray, predicate);

    if (pick.hit) {
      // Return the point where the ground is detected
      return pick.pickedPoint;
    } else {
      // No collision detected
      return Vector3.Zero();
    }
  }

  public update(position: Vector3): void {
    this._deltaTime = this.scene.getEngine().getDeltaTime() / 1000.0;
    this.playerPosition = position;

    this.comportement();

    // Calculez la distance entre le gobelin et le joueur
    this.distanceFromPlayer = Vector3.Distance(this.mesh.absolutePosition, this.playerPosition);

    this.mesh.moveWithCollisions(this.moveDirection.addInPlace(this._gravity));
    this.updateOrientation();

    // Mettez à jour la gravité et les collisions
    this._updateGroundDetection();
    this._animatePlayer();
  }

  comportement() {
    // Add logs to check the states
    console.log(`Current state of the goblin: ${this.states}`);
    switch (this.states) {
      case STATES.STATE_IDLE:
        this.comportementIdle();
        this.setAnimation(this._idle);
        break;
      case STATES.STATE_SEARCH:
        this.comportementSearch();
        this.setAnimation(this._walk);
        break;
      case STATES.STATE_FOLLOW:
        this.comportementFollow();
        this.setAnimation(this._run);
        break;
      case STATES.STATE_ATTACK:
        this.comportementAttack();
        this.setAnimation(this._attack);
        break;
    }
  }

  comportementIdle() {
    let now = performance.now();

    // Vérifiez les distances par rapport au joueur
    if (this.distanceFromPlayer <= LOOK_DISTANCE) {
      this.states = STATES.STATE_FOLLOW;
    } else if (this.distanceFromPlayer <= SENS_DISTANCE) {
      this.states = STATES.STATE_SEARCH;
    } else {
      // Déplacez le gobelin de façon aléatoire
      if (now > this.nextTargetTime) {
        let x = Scalar.RandomRange(-5, 5);
        let z = Scalar.RandomRange(-5, 5);
        this.targetPosition.set(x, 0, z);
        this.nextTargetTime = now + 5000;
      }

      // Déplacez le gobelin vers la position cible
      this.targetPosition.subtractToRef(this.mesh.absolutePosition, this.moveDirection);
      if (this.moveDirection.length() < 0.001) {
        this.moveDirection.setAll(0);
      } else {
        this.speed = NORMAL_SPEED;
        this.moveDirection.normalize();
      }
    }
  }

  comportementSearch() {
    if (this.distanceFromPlayer <= LOOK_DISTANCE) {
      this.states = STATES.STATE_FOLLOW;
    } else if (this.distanceFromPlayer > SENS_DISTANCE) {
      this.states = STATES.STATE_IDLE;
    } else {
      this.playerPosition.subtractToRef(this.mesh.absolutePosition, this.moveDirection);
      this.moveDirection.addInPlaceFromFloats(Scalar.RandomRange(-2, 2), 0, Scalar.RandomRange(-2, 2));
      if (this.moveDirection.length() < 0.001) {
        this.moveDirection.setAll(0);
      } else {
        this.speed = NORMAL_SPEED;
        this.moveDirection.normalize();
      }
    }
  }

  comportementFollow() {
    if (this.distanceFromPlayer > SENS_DISTANCE) {
      this.states = STATES.STATE_IDLE;
    } else if (this.distanceFromPlayer > LOOK_DISTANCE) {
      this.states = STATES.STATE_SEARCH;
    } else if (this.distanceFromPlayer <= 1.5) { // Check if the Goblin is very close to the player
      this.states = STATES.STATE_ATTACK;
    } else {
      this.playerPosition.subtractToRef(this.mesh.absolutePosition, this.moveDirection);
      if (this.moveDirection.lengthSquared() < 0.001) {
        this.moveDirection.setAll(0);
      } else {
        this.speed = SPRINT_SPEED;
        this.moveDirection.normalize().scaleInPlace(this.speed);
      }
    }
  }
  comportementAttack() {
    this.moveDirection.setAll(0); // Goblin stops to attack
  
    // Check if the player has moved away
    if (this.distanceFromPlayer > 1.5) {
      if (this.distanceFromPlayer > SENS_DISTANCE) {
        this.states = STATES.STATE_IDLE;
      } else if (this.distanceFromPlayer > LOOK_DISTANCE) {
        this.states = STATES.STATE_SEARCH;
      } else {
        this.states = STATES.STATE_FOLLOW;
      }
    }
  
  }
}

export default Goblin;

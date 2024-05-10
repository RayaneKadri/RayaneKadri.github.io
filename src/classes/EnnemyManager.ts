import { Vector3, Scalar } from '@babylonjs/core';
import Goblin from './Goblin';

const MAX_GOBLIN = 15;

class EnnemyManager {
  goblins: Goblin[] = [];
  scene;
  private frameCounter: number = 0; // Keeps track of the frames
  private updateInterval: number = 5; // Set how often to update (every 10 frames)

  constructor(scene) {
    this.scene = scene;
  }

  async init(playerPosition: Vector3) {
    // Générer un nombre aléatoire de gobelins
    const numGoblins = Scalar.RandomRange(1, MAX_GOBLIN);

    for (let i = 0; i < numGoblins; i++) {
      // Créer un nouveau gobelin et l'initialiser
      const goblin = new Goblin(this.scene);
      goblin.init();

      // Positionner le gobelin autour du joueur de manière aléatoire
      const spawnPoint = this.generateRandomSpawnPoint(playerPosition, 10, 20);
      goblin.position = spawnPoint;

      this.goblins.push(goblin);
    }
  }

  // Fonction pour générer un point d'apparition aléatoire autour du joueur
  generateRandomSpawnPoint(center: Vector3, minRadius: number, maxRadius: number): Vector3 {
    const angle = Scalar.RandomRange(0, 2 * Math.PI);
    const radius = Scalar.RandomRange(minRadius, maxRadius);

    return new Vector3(
      center.x + Math.cos(angle) * radius,
      center.y,
      center.z + Math.sin(angle) * radius
    );
  }

  update(playerPosition: Vector3) {
    this.frameCounter++;

    // Only update if it's a multiple of updateInterval
    if (this.frameCounter % this.updateInterval === 0) {
        for (const goblin of this.goblins) {
            goblin.update(playerPosition);
        }
    }
}
}

export default EnnemyManager;

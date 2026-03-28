import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';
import { findClosestCellIndex } from './RaceLine.js';

const DIFFICULTY_SETTINGS = {
	easy:   { speedMult: 0.70, lookahead: 1, wobble: 0.3 },
	medium: { speedMult: 0.85, lookahead: 1, wobble: 0.15 },
	hard:   { speedMult: 0.97, lookahead: 2, wobble: 0.0 },
};

const _toTarget = new THREE.Vector3();
const _aiForward = new THREE.Vector3();

export class AIVehicle extends Vehicle {

	constructor( raceLine, difficulty = 'medium' ) {

		super();

		this.raceLine = raceLine;
		this.settings = DIFFICULTY_SETTINGS[ difficulty ] ?? DIFFICULTY_SETTINGS.medium;

	}

	updateAI( dt ) {

		if ( ! this.raceLine || this.raceLine.length === 0 ) return;

		const { lookahead, speedMult, wobble } = this.settings;

		// Find closest cell to current position
		const currentIdx = findClosestCellIndex( this.raceLine, this.spherePos.x, this.spherePos.z );

		// Look ahead by `lookahead` cells (wrap around)
		const targetIdx = ( currentIdx + lookahead ) % this.raceLine.length;
		const targetCell = this.raceLine[ targetIdx ];

		// Direction from vehicle to target
		_toTarget.set( targetCell.worldX - this.spherePos.x, 0, targetCell.worldZ - this.spherePos.z );
		_toTarget.normalize();

		// Vehicle's current forward direction
		_aiForward.set( 0, 0, 1 ).applyQuaternion( this.container.quaternion );
		_aiForward.y = 0;
		_aiForward.normalize();

		// Cross is computed as Ax*Bz - Az*Bx. If target is right (-X), cross > 0.
		const cross = _aiForward.x * _toTarget.z - _aiForward.z * _toTarget.x;

		// inputX: positive turns right.
		const steer = cross + ( Math.random() - 0.5 ) * wobble;

		const input = {
			x: THREE.MathUtils.clamp( steer * 2, - 1, 1 ),
			z: speedMult,
			boost: false,
		};

		this.update( dt, input );

	}

}

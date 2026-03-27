import * as THREE from 'three';

const _worldPos = new THREE.Vector3();
const _worldLook = new THREE.Vector3();
const _behind = new THREE.Vector3();

// Camera modes
const MODE_ISOMETRIC = 0;
const MODE_THIRD_PERSON = 1;
const MODE_FIRST_PERSON = 2;
const MODE_COUNT = 3;

export class Camera {

	constructor() {

		this.camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 0.1, 60 );

		// Isometric offset — matches Godot View: 45° azimuth, 35° elevation, distance 16
		this.offset = new THREE.Vector3( 9.27, 9.18, 9.27 );
		this.targetPosition = new THREE.Vector3();

		this.camera.position.copy( this.offset );
		this.camera.lookAt( 0, 0, 0 );

		this.mode = MODE_ISOMETRIC;
		this.vehicle = null;

		// Third-person chase camera state
		this.chasePos = new THREE.Vector3();
		this.chaseLook = new THREE.Vector3();
		this.chaseInitialized = false;

		window.addEventListener( 'resize', () => {

			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();

		} );

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.code === 'KeyC' ) this.cycleMode();

		} );

	}

	setVehicle( vehicle ) {

		this.vehicle = vehicle;

	}

	cycleMode() {

		this.mode = ( this.mode + 1 ) % MODE_COUNT;

		switch ( this.mode ) {

			case MODE_ISOMETRIC:
				this.camera.fov = 40;
				this.camera.near = 0.1;
				break;

			case MODE_THIRD_PERSON:
				this.camera.fov = 60;
				this.camera.near = 0.1;
				this.chaseInitialized = false;
				break;

			case MODE_FIRST_PERSON:
				this.camera.fov = 100;
				this.camera.near = 0.05;
				break;

		}

		this.camera.updateProjectionMatrix();

	}

	get firstPerson() {

		return this.mode === MODE_FIRST_PERSON;

	}

	update( dt, target ) {

		if ( this.mode === MODE_FIRST_PERSON && this.vehicle?.playerSeat ) {

			const seat = this.vehicle.playerSeat;

			// Camera at the seat marker position
			seat.getWorldPosition( _worldPos );

			// Look ahead along the seat's forward (+Z) direction
			_worldLook.set( 0, 0, 2 );
			seat.localToWorld( _worldLook );

			this.camera.position.copy( _worldPos );
			this.camera.lookAt( _worldLook );

		} else if ( this.mode === MODE_THIRD_PERSON && this.vehicle ) {

			const container = this.vehicle.container;

			// Desired position: behind and above the vehicle
			_behind.set( 0, 2.5, - 5 ).applyQuaternion( container.quaternion );
			_worldPos.copy( target ).add( _behind );

			// Look-at target: slightly ahead of the vehicle
			_worldLook.set( 0, 0.5, 4 ).applyQuaternion( container.quaternion ).add( target );

			if ( ! this.chaseInitialized ) {

				this.chasePos.copy( _worldPos );
				this.chaseLook.copy( _worldLook );
				this.chaseInitialized = true;

			}

			// Smooth follow
			const followSpeed = 5;
			this.chasePos.lerp( _worldPos, 1 - Math.exp( - followSpeed * dt ) );
			this.chaseLook.lerp( _worldLook, 1 - Math.exp( - followSpeed * dt ) );

			this.camera.position.copy( this.chasePos );
			this.camera.lookAt( this.chaseLook );

		} else {

			this.targetPosition.lerp( target, dt * 4 );

			this.camera.position.copy( this.targetPosition ).add( this.offset );
			this.camera.lookAt( this.targetPosition );

		}

	}

}

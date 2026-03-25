import * as THREE from 'three';

const _worldPos = new THREE.Vector3();
const _worldLook = new THREE.Vector3();

export class Camera {

	constructor() {

		this.camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 0.1, 60 );

		// Isometric offset — matches Godot View: 45° azimuth, 35° elevation, distance 16
		this.offset = new THREE.Vector3( 9.27, 9.18, 9.27 );
		this.targetPosition = new THREE.Vector3();

		this.camera.position.copy( this.offset );
		this.camera.lookAt( 0, 0, 0 );

		this.firstPerson = false;
		this.vehicle = null;

		window.addEventListener( 'resize', () => {

			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();

		} );

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.code === 'KeyC' ) this.toggleFirstPerson();

		} );

	}

	setVehicle( vehicle ) {

		this.vehicle = vehicle;

	}

	toggleFirstPerson() {

		this.firstPerson = ! this.firstPerson;

		if ( this.firstPerson ) {

			this.camera.fov = 100;
			this.camera.near = 0.05;

		} else {

			this.camera.fov = 40;
			this.camera.near = 0.1;

		}

		this.camera.updateProjectionMatrix();

	}

	update( dt, target ) {

		if ( this.firstPerson && this.vehicle?.playerSeat ) {

			const seat = this.vehicle.playerSeat;

			// Camera at the seat marker position
			seat.getWorldPosition( _worldPos );

			// Look ahead along the seat's forward (+Z) direction
			_worldLook.set( 0, 0, 2 );
			seat.localToWorld( _worldLook );

			this.camera.position.copy( _worldPos );
			this.camera.lookAt( _worldLook );

		} else {

			this.targetPosition.lerp( target, dt * 4 );

			this.camera.position.copy( this.targetPosition ).add( this.offset );
			this.camera.lookAt( this.targetPosition );

		}

	}

}

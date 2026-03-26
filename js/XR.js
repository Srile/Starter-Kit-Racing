import * as THREE from 'three';

const DEAD_ZONE = 0.15;
const FIT_SIZE = 1.5; // meters — track fits within this on the floor
const FP_SCALE = 2; // first-person scene scale multiplier
import { WHEEL_MAX_ANGLE } from './Vehicle.js';

const _camPos = new THREE.Vector3();
const _seatPos = new THREE.Vector3();
const _handPos = new THREE.Vector3();
const _yaw180 = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), Math.PI );
const _wheelMatrix = new THREE.Matrix4();

export class XRManager {

	constructor( renderer ) {

		this.renderer = renderer;
		this.mode = null; // 'vr' | 'ar' | null
		this.cameraRig = new THREE.Group();
		this.gameContainer = null;
		this.trackBounds = null;
		this.vehicle = null;
		this.buttonContainer = null;

		// Plane detection state
		this._xrScale = 1;
		this._tablePlaced = false;
		this._floorPlaced = false;

		// First-person VR state
		this.firstPerson = false;
		this._prevAPressed = false;
		this._leftGrabAngle = null;
		this._rightGrabAngle = null;
		this._wheelAngle = 0;

		// Controller grip visualisation
		this._leftGrip = null;
		this._rightGrip = null;
		this._leftSphere = null;
		this._rightSphere = null;

		// Callbacks for session lifecycle
		this.onSessionStart = null;
		this.onSessionEnd = null;
		this.onFirstPersonChanged = null;

		renderer.xr.enabled = true;

	}

	get scale() {

		return this.firstPerson ? FP_SCALE : this._xrScale;

	}

	_createHandSpheres() {

		const geo = new THREE.SphereGeometry( 0.03, 16, 16 );
		const mat = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.5 } );

		this._leftSphere = new THREE.Mesh( geo, mat );
		this._rightSphere = new THREE.Mesh( geo, mat );
		this._leftSphere.visible = false;
		this._rightSphere.visible = false;

		this._leftGrip = this.renderer.xr.getControllerGrip( 0 );
		this._rightGrip = this.renderer.xr.getControllerGrip( 1 );

		this._leftGrip.add( this._leftSphere );
		this._rightGrip.add( this._rightSphere );

		this.cameraRig.add( this._leftGrip );
		this.cameraRig.add( this._rightGrip );

	}

	createButtons() {

		if ( ! navigator.xr ) return;

		const container = document.createElement( 'div' );
		container.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);display:flex;gap:12px;z-index:10;';

		const btnStyle = 'padding:12px 24px;font:bold 16px sans-serif;border-radius:8px;border:none;color:white;cursor:pointer;';

		navigator.xr.isSessionSupported( 'immersive-vr' ).then( ( ok ) => {

			if ( ! ok ) return;
			const btn = document.createElement( 'button' );
			btn.textContent = 'Enter VR';
			btn.style.cssText = btnStyle + 'background:#4CAF50;';
			btn.onclick = () => this.startSession( 'vr' );
			container.appendChild( btn );

		} );

		navigator.xr.isSessionSupported( 'immersive-ar' ).then( ( ok ) => {

			if ( ! ok ) return;
			const btn = document.createElement( 'button' );
			btn.textContent = 'Enter AR';
			btn.style.cssText = btnStyle + 'background:#2196F3;';
			btn.onclick = () => this.startSession( 'ar' );
			container.appendChild( btn );

		} );

		document.body.appendChild( container );
		this.buttonContainer = container;

		this._createHandSpheres();

	}

	async startSession( mode ) {

		this.mode = mode;

		const type = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
		const optionalFeatures = [ 'local-floor', 'hand-tracking' ];

		if ( mode === 'ar' ) optionalFeatures.push( 'plane-detection' );

		const init = { optionalFeatures };

		const session = await navigator.xr.requestSession( type, init );

		this.renderer.xr.setReferenceSpaceType( 'local-floor' );

		// Native framebuffer resolution — without this everything looks pixelated
		const gl = this.renderer.getContext();
		const layer = new XRWebGLLayer( session, gl, {
			framebufferScaleFactor: XRWebGLLayer.getNativeFramebufferScaleFactor( session ),
		} );
		session.updateRenderState( { baseLayer: layer } );

		this.renderer.xr.setSession( session );

		// Compute scale but defer positioning until the first frame,
		// when the camera's real-world position is available
		if ( this.gameContainer && this.trackBounds ) {

			const b = this.trackBounds;
			const trackSize = Math.max( b.halfWidth, b.halfDepth ) * 2;
			this._xrScale = FIT_SIZE / trackSize;
			this._tablePlaced = false;
			this._floorPlaced = false;

			this.gameContainer.scale.setScalar( this._xrScale );

		}

		this.firstPerson = false;
		this._prevAPressed = false;

		if ( this.onSessionStart ) this.onSessionStart( mode );

		if ( this.buttonContainer ) this.buttonContainer.style.display = 'none';

		session.addEventListener( 'end', () => {

			this.mode = null;
			this.firstPerson = false;

			if ( this.gameContainer ) {

				this.gameContainer.scale.setScalar( 1 );
				this.gameContainer.position.set( 0, 0, 0 );

			}

			this.cameraRig.position.set( 0, 0, 0 );
			this.cameraRig.quaternion.identity();

			this._leftSphere.visible = false;
			this._rightSphere.visible = false;

			if ( this.buttonContainer ) this.buttonContainer.style.display = 'flex';
			if ( this.onSessionEnd ) this.onSessionEnd();

		} );

	}

	_toggleFirstPerson() {

		this.firstPerson = ! this.firstPerson;
		this._leftGrabAngle = null;
		this._rightGrabAngle = null;
		this._wheelAngle = 0;

		if ( this.firstPerson ) {

			// Scaled-up scene for first-person driving
			this.gameContainer.scale.setScalar( FP_SCALE );
			this.gameContainer.position.set( 0, 0, 0 );

		} else {

			// Restore RC car scale
			this.gameContainer.scale.setScalar( this._xrScale );
			this._floorPlaced = false;
			this._tablePlaced = false;

			this.cameraRig.position.set( 0, 0, 0 );
			this.cameraRig.quaternion.identity();

		}

		this._leftSphere.visible = this.firstPerson;
		this._rightSphere.visible = this.firstPerson;

		if ( this.onFirstPersonChanged ) this.onFirstPersonChanged( this.firstPerson );

	}

	update( frame ) {

		if ( ! this.gameContainer || ! this.trackBounds ) return;

		if ( this.firstPerson ) {

			this._updateFirstPerson();
			return;

		}

		const camera = this.renderer.xr.getCamera();
		const b = this.trackBounds;
		const s = this._xrScale;

		// Place 0.5m below the player and centered at the player's position
		if ( ! this._floorPlaced ) {

			camera.getWorldPosition( _camPos );

			this.gameContainer.position.set(
				_camPos.x - b.centerX * s,
				_camPos.y - 0.5,
				_camPos.z - b.centerZ * s
			);

			this._floorPlaced = true;

		}

		// Snap to a detected table if available
		if ( this._tablePlaced || ! frame?.detectedPlanes ) return;

		const refSpace = this.renderer.xr.getReferenceSpace();
		if ( ! refSpace ) return;

		let closestPose = null;
		let minDistanceSq = Infinity;

		camera.getWorldPosition( _camPos );

		// Find the closest table
		for ( const plane of frame.detectedPlanes ) {

			if ( plane.semanticLabel !== 'table' ) continue;

			const pose = frame.getPose( plane.planeSpace, refSpace );
			if ( ! pose ) continue;

			const p = pose.transform.position;
			const dx = p.x - _camPos.x;
			const dy = p.y - _camPos.y;
			const dz = p.z - _camPos.z;
			const distSq = dx * dx + dy * dy + dz * dz;

			if ( distSq < minDistanceSq ) {

				minDistanceSq = distSq;
				closestPose = pose;

			}

		}

		if ( closestPose ) {

			const p = closestPose.transform.position;

			this.gameContainer.position.set(
				p.x - b.centerX * s,
				p.y,
				p.z - b.centerZ * s
			);

			this._tablePlaced = true;

		}

	}

	_updateFirstPerson() {

		const seat = this.vehicle?.playerSeat;
		if ( ! seat ) return;

		// Get the seat world position and the vehicle's rotation
		seat.getWorldPosition( _seatPos );

		// Position the rig so the user's floor-level origin maps to the seat
		// The user's eyes are ~1.6m above the rig origin in local-floor
		this.cameraRig.position.set( _seatPos.x, _seatPos.y - 1.6, _seatPos.z );

		// Rotate the rig to match the vehicle, flipped 180° so the user faces forward
		this.cameraRig.quaternion.copy( this.vehicle.container.quaternion ).multiply( _yaw180 );

	}

	_getHandWheelAngle( grip ) {

		const wheel = this.vehicle.steeringWheel;
		wheel.updateWorldMatrix( true, false );

		// Transform hand position into the wheel's local space
		_wheelMatrix.copy( wheel.matrixWorld ).invert();
		grip.getWorldPosition( _handPos );
		_handPos.applyMatrix4( _wheelMatrix );

		// Angle on the wheel's XY plane (wheel rotates around Z)
		return Math.atan2( _handPos.y, _handPos.x );

	}

	getInput() {

		const session = this.renderer.xr.getSession();
		if ( ! session ) return null;

		let x = 0, z = 0;
		let leftSqueezing = false;
		let rightSqueezing = false;
		let steerDelta = 0;
		let steerHands = 0;

		for ( const source of session.inputSources ) {

			if ( ! source.gamepad ) continue;

			const gp = source.gamepad;
			const isLeft = source.handedness === 'left';

			// Right controller: trigger = gas
			if ( ! isLeft ) {

				if ( gp.buttons[ 0 ] && gp.buttons[ 0 ].value > 0.1 ) {

					z = gp.buttons[ 0 ].value;

					if ( gp.hapticActuators && gp.hapticActuators[ 0 ] && gp.hapticActuators[ 0 ].pulse ) {

						gp.hapticActuators[ 0 ].pulse( z * 0.2, 20 );

					}

				}

				// A button (index 4) toggles first person — debounced
				const aPressed = gp.buttons[ 4 ] && gp.buttons[ 4 ].pressed;
				if ( aPressed && ! this._prevAPressed && this.mode === 'vr' ) {

					this._toggleFirstPerson();

				}

				this._prevAPressed = aPressed;

			}

			// Left controller: trigger = reverse
			if ( isLeft ) {

				if ( gp.buttons[ 0 ] && gp.buttons[ 0 ].value > 0.1 ) {

					z = - gp.buttons[ 0 ].value;

					if ( gp.hapticActuators && gp.hapticActuators[ 0 ] && gp.hapticActuators[ 0 ].pulse ) {

						gp.hapticActuators[ 0 ].pulse( gp.buttons[ 0 ].value * 0.1, 20 );

					}

				}

			}

			// First-person steering: squeeze to grab wheel, rotate around its axis
			if ( this.firstPerson && this.vehicle.steeringWheel ) {

				const squeeze = gp.buttons[ 1 ] && gp.buttons[ 1 ].pressed;

				if ( squeeze ) {

					const grip = isLeft ? this._leftGrip : this._rightGrip;
					const angle = this._getHandWheelAngle( grip );
					const prevAngle = isLeft ? this._leftGrabAngle : this._rightGrabAngle;

					if ( prevAngle !== null ) {

						// Compute angular delta, normalized to [-PI, PI]
						let delta = angle - prevAngle;
						if ( delta > Math.PI ) delta -= Math.PI * 2;
						if ( delta < - Math.PI ) delta += Math.PI * 2;

						steerDelta += delta;
						steerHands ++;

					}

					if ( isLeft ) { this._leftGrabAngle = angle; leftSqueezing = true; }
					else { this._rightGrabAngle = angle; rightSqueezing = true; }

				}

			}

			// Joystick X from either controller for steering (RC car mode)
			if ( ! this.firstPerson ) {

				const ax2 = gp.axes.length > 2 ? gp.axes[ 2 ] : 0;
				const ax0 = gp.axes[ 0 ] ?? 0;
				const stickX = Math.abs( ax2 ) > DEAD_ZONE ? ax2
					: ( Math.abs( ax0 ) > DEAD_ZONE ? ax0 : 0 );

				if ( Math.abs( stickX ) > Math.abs( x ) ) {

					x = stickX;

				}

			}

		}

		// Release grab angles for hands that stopped squeezing
		if ( ! leftSqueezing ) this._leftGrabAngle = null;
		if ( ! rightSqueezing ) this._rightGrabAngle = null;

		if ( this.firstPerson ) {

			if ( steerHands > 0 ) {

				// Average the delta when both hands are steering
				this._wheelAngle += steerDelta / steerHands;
				this._wheelAngle = THREE.MathUtils.clamp(
					this._wheelAngle, - WHEEL_MAX_ANGLE, WHEEL_MAX_ANGLE
				);

			} else {

				// Spring back to center when released
				this._wheelAngle = 0;

			}

			x = this._wheelAngle / WHEEL_MAX_ANGLE;

		}

		return { x, z };

	}


}

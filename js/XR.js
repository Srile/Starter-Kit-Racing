import * as THREE from 'three';

const DEAD_ZONE = 0.15;
const FLOOR_DISTANCE = 0.8; // meters in front of the player
const FIT_SIZE = 0.8; // meters — track fits within this on the floor

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

		// Callbacks for session lifecycle
		this.onSessionStart = null;
		this.onSessionEnd = null;

		renderer.xr.enabled = true;

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

	}

	async startSession( mode ) {

		this.mode = mode;

		const type = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
		const init = { optionalFeatures: [ 'local-floor', 'hand-tracking', 'plane-detection' ] };

		const session = await navigator.xr.requestSession( type, init );

		this.renderer.xr.setReferenceSpaceType( 'local-floor' );

		// Native framebuffer resolution — without this everything looks pixelated
		const gl = this.renderer.getContext();
		const layer = new XRWebGLLayer( session, gl, {
			framebufferScaleFactor: XRWebGLLayer.getNativeFramebufferScaleFactor( session ),
		} );
		session.updateRenderState( { baseLayer: layer } );

		this.renderer.xr.setSession( session );

		// Scale and position the track on the floor in front of the player
		if ( this.gameContainer && this.trackBounds ) {

			const b = this.trackBounds;
			const trackSize = Math.max( b.halfWidth, b.halfDepth ) * 2;
			const scale = FIT_SIZE / trackSize;
			this._xrScale = scale;
			this._tablePlaced = false;

			this.gameContainer.scale.setScalar( scale );
			this.gameContainer.position.set(
				- b.centerX * scale,
				0.5 * scale,
				- FLOOR_DISTANCE - b.centerZ * scale
			);

		}

		if ( this.onSessionStart ) this.onSessionStart( mode );

		if ( this.buttonContainer ) this.buttonContainer.style.display = 'none';

		session.addEventListener( 'end', () => {

			this.mode = null;

			if ( this.gameContainer ) {

				this.gameContainer.scale.setScalar( 1 );
				this.gameContainer.position.set( 0, 0, 0 );

			}

			this.cameraRig.position.set( 0, 0, 0 );
			this.cameraRig.rotation.set( 0, 0, 0 );

			if ( this.buttonContainer ) this.buttonContainer.style.display = 'flex';
			if ( this.onSessionEnd ) this.onSessionEnd();

		} );

	}

	update( frame ) {

		if ( ! frame?.detectedPlanes || this._tablePlaced ) return;
		if ( ! this.gameContainer || ! this.trackBounds ) return;

		const refSpace = this.renderer.xr.getReferenceSpace();
		if ( ! refSpace ) return;

		for ( const plane of frame.detectedPlanes ) {

			if ( plane.semanticLabel !== 'table' ) continue;

			const pose = frame.getPose( plane.planeSpace, refSpace );
			if ( ! pose ) continue;

			const p = pose.transform.position;
			const b = this.trackBounds;
			const s = this._xrScale;

			this.gameContainer.position.set(
				p.x - b.centerX * s,
				p.y + 0.5 * s,
				p.z - b.centerZ * s
			);

			this._tablePlaced = true;
			break;

		}

	}

	getInput() {

		const session = this.renderer.xr.getSession();
		if ( ! session ) return null;

		let x = 0, z = 0;

		for ( const source of session.inputSources ) {

			if ( ! source.gamepad ) continue;

			const gp = source.gamepad;

			// Right controller: trigger = gas, B = reverse
			if ( source.handedness === 'right' ) {

				// Trigger (index 0) = accelerate
				if ( gp.buttons[ 0 ] && gp.buttons[ 0 ].value > 0.1 ) {

					z = gp.buttons[ 0 ].value;

				}

				// B button (index 5) = reverse — overrides trigger
				if ( gp.buttons[ 5 ] && gp.buttons[ 5 ].pressed ) {

					z = - 1;

				}

			}

			// Joystick X from either controller for steering
			// Quest: thumbstick at axes[2], fallback to axes[0]
			const ax2 = gp.axes.length > 2 ? gp.axes[ 2 ] : 0;
			const ax0 = gp.axes[ 0 ] ?? 0;
			const stickX = Math.abs( ax2 ) > DEAD_ZONE ? ax2
				: ( Math.abs( ax0 ) > DEAD_ZONE ? ax0 : 0 );

			if ( Math.abs( stickX ) > Math.abs( x ) ) {

				x = stickX;

			}

		}

		return { x, z };

	}


}

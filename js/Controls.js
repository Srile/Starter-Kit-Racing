export class Controls {

	constructor() {

		this.keys = {};
		this.x = 0;
		this.z = 0;

		// Touch state
		this.touchSteer = 0;
		this.touchGas = false;
		this.touchBrake = false;
		this.steerPointerId = null;
		this.steerStartX = 0;

		window.addEventListener( 'keydown', ( e ) => this.keys[ e.code ] = true );
		window.addEventListener( 'keyup', ( e ) => this.keys[ e.code ] = false );

		this.setupTouchUI();

	}

	setupTouchUI() {

		if ( ! ( 'ontouchstart' in window ) ) return;

		const css = document.createElement( 'style' );
		css.textContent = `
			.touch-controls { position: absolute; bottom: 0; left: 0; right: 0; height: 50%; pointer-events: none; z-index: 10; }
			.steer-zone { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; touch-action: none; }
			.steer-base { position: absolute; bottom: 24px; left: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); }
			.steer-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: transform 0.05s; }
			.btn-zone { position: absolute; right: 24px; bottom: 24px; pointer-events: auto; touch-action: none; }
			.touch-btn { width: 76px; height: 76px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.5); font: bold 13px -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; touch-action: none; position: absolute; }
			.touch-btn.gas { background: rgba(80,180,80,0.25); right: 0; bottom: 80px; }
			.touch-btn.gas.active { background: rgba(80,180,80,0.5); border-color: rgba(80,180,80,0.6); }
			.touch-btn.brake { background: rgba(200,80,80,0.25); right: 80px; bottom: 0; }
			.touch-btn.brake.active { background: rgba(200,80,80,0.5); border-color: rgba(200,80,80,0.6); }
		`;
		document.head.appendChild( css );

		const container = document.createElement( 'div' );
		container.className = 'touch-controls';

		// Left: steering zone with joystick
		const steerZone = document.createElement( 'div' );
		steerZone.className = 'steer-zone';

		const base = document.createElement( 'div' );
		base.className = 'steer-base';
		const knob = document.createElement( 'div' );
		knob.className = 'steer-knob';
		base.appendChild( knob );
		steerZone.appendChild( base );

		// Right: gas and brake buttons
		// Right: gas (top-right) and brake (bottom-left) — diagonal for comfortable thumb reach
		const btnZone = document.createElement( 'div' );
		btnZone.className = 'btn-zone';

		const gasBtn = document.createElement( 'div' );
		gasBtn.className = 'touch-btn gas';
		gasBtn.textContent = 'GAS';

		const brakeBtn = document.createElement( 'div' );
		brakeBtn.className = 'touch-btn brake';
		brakeBtn.textContent = 'BRK';

		btnZone.appendChild( gasBtn );
		btnZone.appendChild( brakeBtn );

		container.appendChild( steerZone );
		container.appendChild( btnZone );
		document.body.appendChild( container );

		// Steering: drag left/right anywhere in the left half
		const steerRange = 60;

		steerZone.addEventListener( 'pointerdown', ( e ) => {

			if ( this.steerPointerId !== null ) return;
			steerZone.setPointerCapture( e.pointerId );
			this.steerPointerId = e.pointerId;
			this.steerStartX = e.clientX;
			this.touchSteer = 0;

		} );

		steerZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			const dx = e.clientX - this.steerStartX;
			this.touchSteer = Math.max( - 1, Math.min( 1, dx / steerRange ) );
			knob.style.transform = `translateX(${ this.touchSteer * 40 }px)`;

		} );

		const endSteer = ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			this.steerPointerId = null;
			this.touchSteer = 0;
			knob.style.transform = '';

		};

		steerZone.addEventListener( 'pointerup', endSteer );
		steerZone.addEventListener( 'pointercancel', endSteer );

		// Gas button
		gasBtn.addEventListener( 'pointerdown', ( e ) => {

			gasBtn.setPointerCapture( e.pointerId );
			this.touchGas = true;
			gasBtn.classList.add( 'active' );

		} );

		const endGas = () => {

			this.touchGas = false;
			gasBtn.classList.remove( 'active' );

		};

		gasBtn.addEventListener( 'pointerup', endGas );
		gasBtn.addEventListener( 'pointercancel', endGas );

		// Brake button
		brakeBtn.addEventListener( 'pointerdown', ( e ) => {

			brakeBtn.setPointerCapture( e.pointerId );
			this.touchBrake = true;
			brakeBtn.classList.add( 'active' );

		} );

		const endBrake = () => {

			this.touchBrake = false;
			brakeBtn.classList.remove( 'active' );

		};

		brakeBtn.addEventListener( 'pointerup', endBrake );
		brakeBtn.addEventListener( 'pointercancel', endBrake );

	}

	update() {

		let x = 0, z = 0;

		// Keyboard

		if ( this.keys[ 'KeyA' ] || this.keys[ 'ArrowLeft' ] ) x -= 1;
		if ( this.keys[ 'KeyD' ] || this.keys[ 'ArrowRight' ] ) x += 1;
		if ( this.keys[ 'KeyW' ] || this.keys[ 'ArrowUp' ] ) z += 1;
		if ( this.keys[ 'KeyS' ] || this.keys[ 'ArrowDown' ] ) z -= 1;

		// Gamepad

		const gamepads = navigator.getGamepads();

		for ( const gp of gamepads ) {

			if ( ! gp ) continue;

			const stickX = gp.axes[ 0 ];
			if ( Math.abs( stickX ) > 0.15 ) x = stickX;

			const rt = gp.buttons[ 7 ] ? gp.buttons[ 7 ].value : 0;
			const lt = gp.buttons[ 6 ] ? gp.buttons[ 6 ].value : 0;

			if ( rt > 0.1 || lt > 0.1 ) z = rt - lt;

			break;

		}

		// Touch

		if ( this.touchSteer !== 0 ) x = this.touchSteer;
		if ( this.touchGas ) z = 1;
		if ( this.touchBrake ) z = - 1;

		this.x = x;
		this.z = z;

		return { x, z };

	}

}

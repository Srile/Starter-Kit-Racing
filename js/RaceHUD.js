import { RaceState } from './RaceManager.js';

/**
 * HTML/CSS HUD overlay for the race.
 * Creates DOM elements dynamically, same pattern as Controls.js.
 */
export class RaceHUD {

	constructor() {

		this.container = null;
		this.positionEl = null;
		this.lapEl = null;
		this.timerEl = null;
		this.countdownEl = null;
		this.lapFlashEl = null;
		this._flashTimeout = null;

	}

	init() {

		const css = document.createElement( 'style' );
		css.textContent = `
			.race-hud {
				position: fixed;
				top: 0; left: 0; right: 0; bottom: 0;
				pointer-events: none;
				z-index: 20;
				font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			}

			.hud-pill {
				background: rgba(0, 0, 0, 0.5);
				backdrop-filter: blur(8px);
				-webkit-backdrop-filter: blur(8px);
				border-radius: 12px;
				padding: 8px 16px;
				color: #fff;
				position: absolute;
			}

			.hud-position {
				top: 16px;
				left: 16px;
				font-size: 32px;
				font-weight: 800;
				line-height: 1;
			}

			.hud-position .suffix { font-size: 18px; font-weight: 600; }
			.hud-position .total { font-size: 16px; font-weight: 400; opacity: 0.6; margin-left: 4px; }

			.hud-lap {
				top: 16px;
				right: 16px;
				font-size: 18px;
				font-weight: 600;
			}

			.hud-lap .label { opacity: 0.6; font-weight: 400; }

			.hud-timer {
				top: 16px;
				left: 50%;
				transform: translateX(-50%);
				font-size: 20px;
				font-weight: 600;
				font-variant-numeric: tabular-nums;
			}

			.hud-countdown {
				position: absolute;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%) scale(1);
				font-size: 120px;
				font-weight: 900;
				color: #fff;
				text-shadow: 0 4px 24px rgba(0,0,0,0.5);
				opacity: 0;
				transition: opacity 0.15s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
				pointer-events: none;
			}

			.hud-countdown.active {
				opacity: 1;
				transform: translate(-50%, -50%) scale(1);
			}

			.hud-countdown.pop {
				transform: translate(-50%, -50%) scale(1.3);
			}

			.hud-countdown.go {
				color: #4ade80;
			}

			.hud-lap-flash {
				position: absolute;
				top: 40%;
				left: 50%;
				transform: translate(-50%, -50%);
				font-size: 36px;
				font-weight: 800;
				color: #fbbf24;
				text-shadow: 0 2px 12px rgba(0,0,0,0.5);
				opacity: 0;
				transition: opacity 0.3s;
				pointer-events: none;
			}

			.hud-lap-flash.visible {
				opacity: 1;
			}
		`;
		document.head.appendChild( css );

		this.container = document.createElement( 'div' );
		this.container.className = 'race-hud';

		// Position indicator
		this.positionEl = document.createElement( 'div' );
		this.positionEl.className = 'hud-pill hud-position';
		this.positionEl.innerHTML = '1<span class="suffix">st</span><span class="total"> / 1</span>';

		// Lap counter
		this.lapEl = document.createElement( 'div' );
		this.lapEl.className = 'hud-pill hud-lap';
		this.lapEl.innerHTML = '<span class="label">Lap </span>1<span class="label"> / 3</span>';

		// Timer
		this.timerEl = document.createElement( 'div' );
		this.timerEl.className = 'hud-pill hud-timer';
		this.timerEl.textContent = '00:00.00';

		// Countdown overlay
		this.countdownEl = document.createElement( 'div' );
		this.countdownEl.className = 'hud-countdown';

		// Lap flash text
		this.lapFlashEl = document.createElement( 'div' );
		this.lapFlashEl.className = 'hud-lap-flash';

		this.container.appendChild( this.positionEl );
		this.container.appendChild( this.lapEl );
		this.container.appendChild( this.timerEl );
		this.container.appendChild( this.countdownEl );
		this.container.appendChild( this.lapFlashEl );
		document.body.appendChild( this.container );

	}

	/**
	 * Update the HUD each frame.
	 * @param {RaceManager} race
	 */
	update( race ) {

		if ( ! this.container ) return;

		const show = race.state === RaceState.COUNTDOWN || race.state === RaceState.RACING;

		this.positionEl.style.display = show ? '' : 'none';
		this.lapEl.style.display = show ? '' : 'none';
		this.timerEl.style.display = show ? '' : 'none';

		if ( ! show ) return;

		// Position
		const pos = race.position;
		const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
		this.positionEl.innerHTML =
			`${ pos }<span class="suffix">${ suffix }</span><span class="total"> / ${ race.totalRacers }</span>`;

		// Lap
		const currentLap = Math.max( 1, Math.min( race.completedLaps + 1, race.totalLaps ) );
		this.lapEl.innerHTML =
			`<span class="label">Lap </span>${ currentLap }<span class="label"> / ${ race.totalLaps }</span>`;

		// Timer
		this.timerEl.textContent = race.formatTime();

	}

	/**
	 * Show a countdown number (3, 2, 1) or "GO!" (0).
	 */
	showCountdown( value ) {

		if ( ! this.countdownEl ) return;

		const text = value === 0 ? 'GO!' : String( value );
		this.countdownEl.textContent = text;
		this.countdownEl.className = 'hud-countdown pop' + ( value === 0 ? ' go' : '' );

		// Trigger reflow for animation restart
		void this.countdownEl.offsetWidth;
		this.countdownEl.classList.add( 'active' );
		this.countdownEl.classList.remove( 'pop' );

		// Hide after a moment
		clearTimeout( this._countdownTimeout );
		this._countdownTimeout = setTimeout( () => {

			this.countdownEl.classList.remove( 'active' );

		}, value === 0 ? 800 : 700 );

	}

	/**
	 * Show "FINAL LAP!" or "Lap X" flash.
	 */
	showLapFlash( text ) {

		if ( ! this.lapFlashEl ) return;

		this.lapFlashEl.textContent = text;
		this.lapFlashEl.classList.add( 'visible' );

		clearTimeout( this._flashTimeout );
		this._flashTimeout = setTimeout( () => {

			this.lapFlashEl.classList.remove( 'visible' );

		}, 1500 );

	}

	dispose() {

		if ( this.container && this.container.parentNode ) {

			this.container.parentNode.removeChild( this.container );

		}

		clearTimeout( this._countdownTimeout );
		clearTimeout( this._flashTimeout );

	}

}

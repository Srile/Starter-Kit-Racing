import { findClosestCellIndex } from './RaceLine.js';

export const RaceState = {
	PRE_RACE: 'PRE_RACE',
	COUNTDOWN: 'COUNTDOWN',
	RACING: 'RACING',
	FINISHED: 'FINISHED',
};

/**
 * Manages the race lifecycle: countdown → racing → finished,
 * plus lap tracking and position calculation for all racers.
 */
export class RaceManager {

	constructor( raceLine, totalLaps = 3 ) {

		this.raceLine = raceLine;
		this.totalLaps = totalLaps;

		this.state = RaceState.PRE_RACE;
		this.stateTimer = 0;
		this.countdownValue = 3;
		this.raceTime = 0;

		// All racers — player first, then AIs
		this.racers = [];

		// Player-facing state (kept in sync with the player racer)
		this.currentCellIndex = 0;
		this.completedLaps = 0;
		this.position = 1;
		this.totalRacers = 1;

		// Pre-allocated sparse grid for zero-allocation position updates
		this._gridBuckets = [];
		this._activeKeys = [];

		// Callbacks
		this.onCountdownTick = null;  // (value) => {}
		this.onLapComplete = null;    // (lapNumber) => {}
		this.onRaceFinished = null;   // (results) => {}

	}

	/**
	 * Register a racer. isPlayer=true for the human player (should be first added).
	 * @returns the racer object — set racer.currentCellIndex after positioning the vehicle.
	 */
	addRacer( vehicle, isPlayer = false ) {

		const racer = {
			vehicle,
			isPlayer,
			currentCellIndex: 0,
			completedLaps: 0,
			finished: false,
			finishTime: null,
			position: this.racers.length + 1,
		};

		this.racers.push( racer );
		this.totalRacers = this.racers.length;

		return racer;

	}

	start() {

		this.state = RaceState.COUNTDOWN;
		this.stateTimer = 0;
		this.countdownValue = 3;

		if ( this.onCountdownTick ) this.onCountdownTick( 3 );

	}

	/**
	 * @param {number} dt — delta time
	 * @returns {{ lockControls: boolean }}
	 */
	update( dt ) {

		switch ( this.state ) {

			case RaceState.PRE_RACE:
				return { lockControls: true };

			case RaceState.COUNTDOWN:
				return this._updateCountdown( dt );

			case RaceState.RACING:
				this._updateRacing( dt );
				return { lockControls: false };

			case RaceState.FINISHED:
				return { lockControls: true };

		}

		return { lockControls: false };

	}

	_updateCountdown( dt ) {

		this.stateTimer += dt;

		const newValue = Math.max( 0, 3 - Math.floor( this.stateTimer ) );

		if ( newValue !== this.countdownValue ) {

			this.countdownValue = newValue;

			if ( this.onCountdownTick ) this.onCountdownTick( newValue );

		}

		if ( this.stateTimer >= 3.5 ) {

			this.state = RaceState.RACING;
			this.raceTime = 0;

		}

		return { lockControls: this.stateTimer < 3.0 };

	}

	_updateRacing( dt ) {

		this.raceTime += dt;

		for ( const racer of this.racers ) {

			this._updateRacerProgress( racer );

		}

		this._calculatePositions();

		// Keep player-facing shorthand in sync
		const player = this._getPlayerRacer();
		if ( player ) {

			this.currentCellIndex = player.currentCellIndex;
			this.completedLaps = player.completedLaps;
			this.position = player.position;

		}

	}

	_updateRacerProgress( racer ) {

		if ( racer.finished ) return;

		const pos = racer.vehicle.spherePos;
		if ( ! pos ) return;

		const closestIdx = findClosestCellIndex( this.raceLine, pos.x, pos.z );
		const len = this.raceLine.length;

		if ( ! racer._initialized ) {

			racer._initialized = true;
			racer.currentCellIndex = closestIdx;

			// If they spawn behind the finish line, their initial closest cell will be near the end of the track.
			// Set completedLaps to -1 so they must cross the line to start Lap 0 (which is the first lap).
			if ( closestIdx > len / 2 ) {

				racer.completedLaps = -1;

			} else {

				racer.completedLaps = 0;

			}

			return;

		}

		let delta = closestIdx - racer.currentCellIndex;

		if ( delta > len / 2 ) delta -= len;
		if ( delta < - len / 2 ) delta += len;

		// Ignore unreasonably large jumps (teleport / initial frame)
		if ( Math.abs( delta ) > 5 ) return;

		const prevIndex = racer.currentCellIndex;
		racer.currentCellIndex = closestIdx;

		// Lap completion: moved forward and crossed the wrap boundary (index wraps 0)
		if ( delta > 0 && closestIdx < prevIndex ) {

			racer.completedLaps ++;

			if ( racer.isPlayer && this.onLapComplete && racer.completedLaps > 0 ) {

				this.onLapComplete( racer.completedLaps );

			}

			if ( racer.completedLaps >= this.totalLaps ) {

				racer.finished = true;
				racer.finishTime = this.raceTime;

				if ( racer.isPlayer ) {

					this.state = RaceState.FINISHED;

					const results = {
						position: racer.position,
						totalRacers: this.totalRacers,
						time: this.raceTime,
						laps: this.totalLaps,
						stars: this._calculateStars( racer.position ),
					};

					if ( this.onRaceFinished ) this.onRaceFinished( results );

				}

			}

		}

		// Backward lap crossing
		if ( delta < 0 && closestIdx > prevIndex ) {

			racer.completedLaps --;

		}

	}

	_calculatePositions() {

		const len = this.raceLine.length;

		// 1. Clear previous frame's active buckets
		for ( let i = 0; i < this._activeKeys.length; i ++ ) {

			this._gridBuckets[ this._activeKeys[ i ] ].length = 0;

		}

		this._activeKeys.length = 0;

		// 2. Drop racers into their track-segment buckets
		for ( const racer of this.racers ) {

			const key = racer.completedLaps * len + racer.currentCellIndex;

			if ( ! this._gridBuckets[ key ] ) {

				this._gridBuckets[ key ] = [];

			}

			if ( this._gridBuckets[ key ].length === 0 ) {

				this._activeKeys.push( key );

			}

			this._gridBuckets[ key ].push( racer );

		}

		// 3. Sort active keys descending (front-most cell first)
		this._activeKeys.sort( ( a, b ) => b - a );

		let currentPosition = 1;

		// 4. Assign positions per bucket, only resolving physical distance for ties
		for ( let i = 0; i < this._activeKeys.length; i ++ ) {

			const key = this._activeKeys[ i ];
			const bucket = this._gridBuckets[ key ];

			if ( bucket.length === 1 ) {

				bucket[ 0 ].position = currentPosition ++;

			} else {

				// Compute local tie-breaker
				const cellIdx = bucket[ 0 ].currentCellIndex;
				const cell = this.raceLine[ cellIdx ];
				const nextCell = this.raceLine[ ( cellIdx + 1 ) % len ];

				// Vector of the cell segment
				const cx = nextCell.worldX - cell.worldX;
				const cz = nextCell.worldZ - cell.worldZ;

				for ( let j = 0; j < bucket.length; j ++ ) {

					const racer = bucket[ j ];
					const pos = racer.vehicle.spherePos;

					if ( ! pos ) {

						racer._localScore = 0;
						continue;

					}

					// Project racer onto cell's forward vector
					racer._localScore = ( pos.x - cell.worldX ) * cx + ( pos.z - cell.worldZ ) * cz;

				}

				// Small local sort just for these clustered cars
				bucket.sort( ( a, b ) => b._localScore - a._localScore );

				for ( let j = 0; j < bucket.length; j ++ ) {

					bucket[ j ].position = currentPosition ++;

				}

			}

		}

	}

	_getPlayerRacer() {

		return this.racers.find( r => r.isPlayer ) ?? null;

	}

	_calculateStars( position ) {

		switch ( position ) {

			case 1: return 3;
			case 2: return 2;
			case 3: return 1;
			default: return 0;

		}

	}

	/**
	 * Total progress for the player (for external use).
	 */
	getProgress() {

		const player = this._getPlayerRacer();
		if ( ! player ) return 0;
		return player.completedLaps * this.raceLine.length + player.currentCellIndex;

	}

	formatTime( time ) {

		if ( time === undefined ) time = this.raceTime;

		const mins = Math.floor( time / 60 );
		const secs = Math.floor( time % 60 );
		const ms = Math.floor( ( time % 1 ) * 100 );

		return `${ String( mins ).padStart( 2, '0' ) }:${ String( secs ).padStart( 2, '0' ) }.${ String( ms ).padStart( 2, '0' ) }`;

	}

}

import { CELL_RAW, GRID_SCALE, ORIENT_DEG, TRACK_CELLS } from './Track.js';

/**
 * Edge directions: 0=+Z (south), 1=+X (east), 2=-Z (north), 3=-X (west)
 * Neighbour offsets for each edge direction
 */
const EDGE_DX = [ 0, 1, 0, - 1 ];
const EDGE_DZ = [ 1, 0, - 1, 0 ];

/**
 * For each track piece type, define which edges are connected (entry/exit).
 * Edges are in LOCAL space at orientation 0°:
 *  - Orientation 0° means the piece faces +Z (south)
 *  - straight: connects edge 0 (+Z) and edge 2 (-Z)
 *  - corner: connects edge 2 (-Z entry) and edge 1 (+X exit)
 */
const PIECE_EDGES = {
	'track-straight': [ 0, 2 ],
	'track-finish':   [ 0, 2 ],
	'track-bump':     [ 0, 2 ],
	'track-ramp':     [ 0, 2 ],
	'track-corner':   [ 0, 3 ],
};

/**
 * Rotate a local edge index by the piece's orientation.
 * Orientation mapping: 0°→0 steps, 90°→1 step, 180°→2 steps, 270°→3 steps
 */
function rotateEdge( localEdge, orientDeg ) {

	const steps = ( ( orientDeg % 360 ) + 360 ) % 360;
	return ( localEdge + steps / 90 ) % 4;

}

/**
 * Get the set of connected edges for a piece in world space.
 */
function getWorldEdges( type, godotOrient ) {

	const localEdges = PIECE_EDGES[ type ];
	if ( ! localEdges ) return [];

	const deg = ORIENT_DEG[ godotOrient ] ?? 0;
	return localEdges.map( ( e ) => rotateEdge( e, deg ) );

}

/**
 * Opposite edge: 0↔2, 1↔3
 */
function oppositeEdge( edge ) {

	return ( edge + 2 ) % 4;

}

/**
 * Generate the race line — an ordered sequence of grid cells forming the circuit loop.
 *
 * @param {Array} cells — array of [ gx, gz, type, godotOrient ] tuples (from TRACK_CELLS or decoded)
 * @returns {Array<{gx, gz, worldX, worldZ, type}>} — ordered race line
 */
export function generateRaceLine( cells ) {

	if ( ! cells ) cells = TRACK_CELLS;

	// Build lookup: "gx,gz" → cell data
	const cellMap = new Map();

	for ( const [ gx, gz, type, orient ] of cells ) {

		cellMap.set( gx + ',' + gz, { gx, gz, type, orient } );

	}

	// Find the finish cell
	let finishCell = null;

	for ( const [ gx, gz, type, orient ] of cells ) {

		if ( type === 'track-finish' ) {

			finishCell = { gx, gz, type, orient };
			break;

		}

	}

	if ( ! finishCell ) {

		console.warn( 'RaceLine: No track-finish cell found, using first cell' );
		const c = cells[ 0 ];
		finishCell = { gx: c[ 0 ], gz: c[ 1 ], type: c[ 2 ], orient: c[ 3 ] };

	}

	// Walk the track: start from the finish cell, pick an exit edge, follow connected cells
	const raceLine = [];
	const visited = new Set();

	let current = finishCell;
	const finishEdges = getWorldEdges( current.type, current.orient );

	// Start by exiting through the first edge of the finish cell
	let exitEdge = finishEdges[ 0 ];

	while ( true ) {

		const key = current.gx + ',' + current.gz;

		if ( visited.has( key ) && raceLine.length > 0 ) break;

		visited.add( key );

		const S = CELL_RAW * GRID_SCALE;

		raceLine.push( {
			gx: current.gx,
			gz: current.gz,
			worldX: ( current.gx + 0.5 ) * S,
			worldZ: ( current.gz + 0.5 ) * S,
			type: current.type,
		} );

		// Move to neighbour through the exit edge
		// Ramps jump over one cell — always try 2 cells ahead first
		let next;

		if ( current.type === 'track-ramp' ) {

			const jumpX = current.gx + EDGE_DX[ exitEdge ] * 2;
			const jumpZ = current.gz + EDGE_DZ[ exitEdge ] * 2;
			next = cellMap.get( jumpX + ',' + jumpZ );

		}

		if ( ! next ) {

			const nx = current.gx + EDGE_DX[ exitEdge ];
			const nz = current.gz + EDGE_DZ[ exitEdge ];
			next = cellMap.get( nx + ',' + nz );

		}

		if ( ! next ) break;

		// The edge we entered the next cell through
		const entryEdge = oppositeEdge( exitEdge );

		// Find the next cell's exit edge (the other connected edge)
		const nextEdges = getWorldEdges( next.type, next.orient );

		if ( nextEdges.length < 2 ) break;

		if ( nextEdges[ 0 ] === entryEdge ) {

			exitEdge = nextEdges[ 1 ];

		} else if ( nextEdges[ 1 ] === entryEdge ) {

			exitEdge = nextEdges[ 0 ];

		} else {

			// Edge mismatch — connectivity error
			console.warn( `RaceLine: Edge mismatch at (${ next.gx }, ${ next.gz }). Entry edge ${ entryEdge } not found in [${ nextEdges }]` );
			break;

		}

		current = next;

	}

	return raceLine;

}

/**
 * Given a world position, find the index of the closest race line cell.
 */
export function findClosestCellIndex( raceLine, worldX, worldZ ) {

	let bestIdx = 0;
	let bestDist = Infinity;

	for ( let i = 0; i < raceLine.length; i ++ ) {

		const cell = raceLine[ i ];
		const dx = worldX - cell.worldX;
		const dz = worldZ - cell.worldZ;
		const dist = dx * dx + dz * dz;

		if ( dist < bestDist ) {

			bestDist = dist;
			bestIdx = i;

		}

	}

	return bestIdx;

}

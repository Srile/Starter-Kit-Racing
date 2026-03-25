import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createWorldSettings, createWorld, addBroadphaseLayer, addObjectLayer, enableCollision, registerAll, updateWorld, rigidBody, box, MotionType } from 'crashcat';
import { Vehicle } from './Vehicle.js';
import { Camera } from './Camera.js';
import { Controls } from './Controls.js';
import { buildTrack, decodeCells, computeSpawnPosition, computeTrackBounds } from './Track.js';
import { buildWallColliders, createSphereBody } from './Physics.js';
import { SmokeTrails } from './Particles.js';
import { GameAudio } from './Audio.js';
import { XRManager } from './XR.js';


const renderer = new THREE.WebGLRenderer( { antialias: true, outputBufferType: THREE.HalfFloatType } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ) );
bloomPass.strength = 0.02;
bloomPass.radius = 0.02;
bloomPass.threshold = 0.5;

renderer.setEffects( [ bloomPass ] );

document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xadb2ba );
scene.fog = new THREE.Fog( 0xadb2ba, 30, 55 );

const dirLight = new THREE.DirectionalLight( 0xffffff, 5 );
dirLight.position.set( 11.4, 15, -5.3 );
dirLight.castShadow = true;
dirLight.shadow.mapSize.setScalar( 4096 );
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 60;
scene.add( dirLight );

const hemiLight = new THREE.HemisphereLight( 0xc8d8e8, 0x7a8a5a, 1.5 );
scene.add( hemiLight );

const xr = new XRManager( renderer );

window.addEventListener( 'resize', () => {

	renderer.setSize( window.innerWidth, window.innerHeight );

} );

const loader = new GLTFLoader();
const modelNames = [
	'vehicle-truck-yellow', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-red',
	'track-straight', 'track-corner', 'track-bump', 'track-finish',
	'decoration-empty', 'decoration-forest', 'decoration-tents',
];

const models = {};

async function loadModels() {

	const promises = modelNames.map( ( name ) =>
		new Promise( ( resolve, reject ) => {

			loader.load( `models/${ name }.glb`, ( gltf ) => {

				gltf.scene.traverse( ( child ) => {

					if ( child.isMesh ) {

						child.material.side = THREE.FrontSide;

					}

				} );

				// Godot imports vehicle models at root_scale=0.5
				if ( name.startsWith( 'vehicle-' ) ) {

					gltf.scene.scale.setScalar( 0.5 );

				}

				models[ name ] = gltf.scene;
				resolve();

			}, undefined, reject );

		} )
	);

	await Promise.all( promises );

}

async function init() {

	registerAll();
	await loadModels();

	const mapParam = new URLSearchParams( window.location.search ).get( 'map' );
	let customCells = null;
	let spawn = null;

	if ( mapParam ) {

		try {

			customCells = decodeCells( mapParam );
			spawn = computeSpawnPosition( customCells );

		} catch ( e ) {

			console.warn( 'Invalid map parameter, using default track' );

		}

	}

	// Compute track bounds and size physics/shadows to fit
	const bounds = computeTrackBounds( customCells );
	const hw = bounds.halfWidth;
	const hd = bounds.halfDepth;
	const groundSize = Math.max( hw, hd ) * 2 + 20;

	const shadowExtent = Math.max( hw, hd ) + 10;
	dirLight.shadow.camera.left = - shadowExtent;
	dirLight.shadow.camera.right = shadowExtent;
	dirLight.shadow.camera.top = shadowExtent;
	dirLight.shadow.camera.bottom = - shadowExtent;
	dirLight.shadow.camera.updateProjectionMatrix();

	const fogNear = groundSize * 0.4;
	const fogFar = groundSize * 0.8;
	scene.fog.near = fogNear;
	scene.fog.far = fogFar;

	// Game container: all visual game objects live here so AR can scale them
	const gameContainer = new THREE.Group();
	scene.add( gameContainer );
	scene.add( dirLight );
	scene.add( hemiLight );

	const decoGroup = buildTrack( gameContainer, models, customCells );


	const worldSettings = createWorldSettings();
	worldSettings.gravity = [ 0, - 9.81, 0 ];

	const BPL_MOVING = addBroadphaseLayer( worldSettings );
	const BPL_STATIC = addBroadphaseLayer( worldSettings );
	const OL_MOVING = addObjectLayer( worldSettings, BPL_MOVING );
	const OL_STATIC = addObjectLayer( worldSettings, BPL_STATIC );

	enableCollision( worldSettings, OL_MOVING, OL_STATIC );
	enableCollision( worldSettings, OL_MOVING, OL_MOVING );

	const world = createWorld( worldSettings );
	world._OL_MOVING = OL_MOVING;
	world._OL_STATIC = OL_STATIC;

	buildWallColliders( world, null, customCells );

	const roadHalf = groundSize / 2;
	rigidBody.create( world, {
		shape: box.create( { halfExtents: [ roadHalf, 0.01, roadHalf ] } ),
		motionType: MotionType.STATIC,
		objectLayer: OL_STATIC,
		position: [ bounds.centerX, - 0.125, bounds.centerZ ],
		friction: 5.0,
		restitution: 0.0,
	} );

	const sphereBody = createSphereBody( world, spawn ? spawn.position : null );

	const vehicle = new Vehicle();
	vehicle.rigidBody = sphereBody;
	vehicle.physicsWorld = world;

	if ( spawn ) {

		const [ sx, sy, sz ] = spawn.position;
		vehicle.spherePos.set( sx, sy, sz );
		vehicle.prevModelPos.set( sx, 0, sz );
		vehicle.container.rotation.y = spawn.angle;

	}

	const vehicleGroup = vehicle.init( models[ 'vehicle-truck-yellow' ] );
	gameContainer.add( vehicleGroup );

	dirLight.target = vehicleGroup;

	const trackCenterTarget = new THREE.Object3D();
	scene.add( trackCenterTarget );

	const cam = new Camera();
	cam.setVehicle( vehicle );
	cam.targetPosition.copy( vehicle.spherePos );

	// XR setup: camera rig and session callbacks
	xr.gameContainer = gameContainer;
	xr.trackBounds = bounds;
	xr.vehicle = vehicle;
	xr.cameraRig.add( cam.camera );
	scene.add( xr.cameraRig );
	xr.createButtons();

	xr.onSessionStart = ( mode ) => {

		renderer.setEffects( [] );
		scene.fog.near = 1000;
		scene.fog.far = 1000;
		if ( mode === 'ar' ) decoGroup.visible = false;

		const s = xr._xrScale;
		dirLight.shadow.camera.left = - shadowExtent * s;
		dirLight.shadow.camera.right = shadowExtent * s;
		dirLight.shadow.camera.top = shadowExtent * s;
		dirLight.shadow.camera.bottom = - shadowExtent * s;
		dirLight.shadow.camera.near = 0.5 * s;
		dirLight.shadow.camera.far = 60 * s;
		dirLight.shadow.camera.updateProjectionMatrix();

	};

	xr.onSessionEnd = () => {

		renderer.setEffects( [ bloomPass ] );
		scene.fog.near = fogNear;
		scene.fog.far = fogFar;
		decoGroup.visible = true;

		dirLight.shadow.camera.left = - shadowExtent;
		dirLight.shadow.camera.right = shadowExtent;
		dirLight.shadow.camera.top = shadowExtent;
		dirLight.shadow.camera.bottom = - shadowExtent;
		dirLight.shadow.camera.near = 0.5;
		dirLight.shadow.camera.far = 60;
		dirLight.shadow.camera.updateProjectionMatrix();

	};

	const controls = new Controls();

	const particles = new SmokeTrails( gameContainer );

	const audio = new GameAudio();
	audio.init( cam.camera, vehicleGroup );

	const _forward = new THREE.Vector3();

	const contactListener = {
		onContactAdded( bodyA, bodyB ) {

			if ( bodyA !== sphereBody && bodyB !== sphereBody ) return;

			_forward.set( 0, 0, 1 ).applyQuaternion( vehicle.container.quaternion );
			_forward.y = 0;
			_forward.normalize();

			const impactVelocity = Math.abs( vehicle.modelVelocity.dot( _forward ) );
			audio.playImpact( impactVelocity );

		}
	};

	const timer = new THREE.Timer();
	const _vehiclePos = new THREE.Vector3();

	function animate( _timestamp, frame ) {

		timer.update();
		const dt = Math.min( timer.getDelta(), 1 / 30 );

		const isXR = renderer.xr.isPresenting;

		if ( isXR ) xr.update( frame );
		const input = isXR
			? ( xr.getInput() ?? { x: 0, z: 0 } )
			: controls.update();

		updateWorld( world, contactListener, dt );

		vehicle.update( dt, input );

		const s = isXR ? xr._xrScale : 1.0;
		vehicleGroup.getWorldPosition( _vehiclePos );

		if ( isXR ) {

			_vehiclePos.set( bounds.centerX, 0, bounds.centerZ );
			gameContainer.localToWorld( _vehiclePos );
			trackCenterTarget.position.copy( _vehiclePos );
			dirLight.target = trackCenterTarget;

		} else {

			dirLight.target = vehicleGroup;

		}

		dirLight.position.set(
			_vehiclePos.x + 11.4 * s,
			_vehiclePos.y + 15 * s,
			_vehiclePos.z - 5.3 * s
		);

		if ( ! isXR ) {

			cam.update( dt, vehicle.spherePos );

		}

		particles.update( dt, vehicle );
		audio.update( dt, vehicle.linearSpeed, input.z, vehicle.driftIntensity );

		renderer.render( scene, cam.camera );

	}

	renderer.setAnimationLoop( animate );

}

init();

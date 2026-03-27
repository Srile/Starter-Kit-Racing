const DETECT_INTERVAL = 66; // ~15 fps detection rate
const SMOOTH = 0.12;

export class FaceTracker {

	constructor() {

		this.active = false;
		this.x = 0; // [-1, 1] horizontal head offset (right = positive)
		this.y = 0; // [-1, 1] vertical head offset (up = positive)

		this._rawX = 0;
		this._rawY = 0;

		this._video = null;
		this._detector = null;
		this._lastDetect = 0;
		this._ready = false;
		this._preview = null;
		this._loading = false;

	}

	async toggle() {

		if ( this.active ) {

			this.stop();

		} else {

			await this.start();

		}

	}

	async start() {

		if ( this.active || this._loading ) return;
		this._loading = true;

		try {

			const stream = await navigator.mediaDevices.getUserMedia( {
				video: { width: 320, height: 240, facingMode: 'user' }
			} );

			const video = document.createElement( 'video' );
			video.srcObject = stream;
			video.setAttribute( 'playsinline', '' );
			video.muted = true;
			video.play();

			await new Promise( ( resolve ) => {

				video.onloadeddata = resolve;

			} );

			this._video = video;

			// Load MediaPipe face detection
			const { FaceDetector, FilesetResolver } = await import(
				'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/+esm'
			);

			const fileset = await FilesetResolver.forVisionTasks(
				'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
			);

			this._detector = await FaceDetector.createFromOptions( fileset, {
				baseOptions: {
					modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
					delegate: 'GPU'
				},
				runningMode: 'VIDEO'
			} );

			this.active = true;
			this._ready = true;
			this._loading = false;
			this._showPreview();

		} catch ( err ) {

			console.warn( 'Face tracking unavailable:', err );
			this._loading = false;
			this.stop();

		}

	}

	stop() {

		this.active = false;
		this._ready = false;
		this._loading = false;

		if ( this._video?.srcObject ) {

			this._video.srcObject.getTracks().forEach( ( t ) => t.stop() );

		}

		this._video = null;

		if ( this._detector ) {

			this._detector.close();
			this._detector = null;

		}

		this._hidePreview();

		this.x = this.y = 0;
		this._rawX = this._rawY = 0;

	}

	update() {

		if ( ! this._ready ) return;

		const now = performance.now();

		if ( now - this._lastDetect >= DETECT_INTERVAL ) {

			this._lastDetect = now;
			this._detect( now );

		}

		// Smooth toward raw values every frame
		this.x += ( this._rawX - this.x ) * SMOOTH;
		this.y += ( this._rawY - this.y ) * SMOOTH;

	}

	_detect( timestamp ) {

		try {

			const result = this._detector.detectForVideo( this._video, timestamp );

			if ( result.detections.length > 0 ) {

				const det = result.detections[ 0 ];
				const box = det.boundingBox;
				const vw = this._video.videoWidth;
				const vh = this._video.videoHeight;

				// Face center normalized to [-1, 1], mirrored horizontally
				const cx = box.originX + box.width * 0.5;
				const cy = box.originY + box.height * 0.5;

				this._rawX = - ( cx / vw - 0.5 ) * 2;
				this._rawY = - ( cy / vh - 0.5 ) * 2;

			}

		} catch ( _e ) {

			// Detection can fail on some frames

		}

	}

	_showPreview() {

		const el = document.createElement( 'video' );
		el.srcObject = this._video.srcObject;
		el.setAttribute( 'playsinline', '' );
		el.muted = true;
		el.play();

		Object.assign( el.style, {
			position: 'fixed',
			top: '12px',
			right: '12px',
			width: '240px',
			borderRadius: '10px',
			border: '2px solid rgba(255,255,255,0.3)',
			opacity: '0.7',
			zIndex: '100',
			transform: 'scaleX(-1)',
			objectFit: 'cover',
			pointerEvents: 'none'
		} );

		document.body.appendChild( el );
		this._preview = el;

	}

	_hidePreview() {

		if ( this._preview ) {

			this._preview.remove();
			this._preview = null;

		}

	}

}

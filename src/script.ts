import './style.css'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowHelper, Object3D } from 'three';
import { threeToCannonVec, cannonToThreeVec, parametersToVec, moveCameraToFitBounds, fitCameraToCenteredObject, concreteMaterial, plasticMaterial, GEOMETRY_TYPE, getGeometryType, simplifyPosition, simplifyQuaternion } from "./utils";
import { degToRad } from 'three/src/math/MathUtils';
import CannonDebugger from 'cannon-es-debugger'
import * as CannonWorkerType from "./worker"; 
// @ts-ignore
import CannonWorker from "workerize-loader!./worker";

const color_black = 0x000000;
const color_white = 0xFFFFFF;

// Initialize Physics Worker
const cannon_worker = CannonWorker() as typeof CannonWorkerType; 	

/**
 * 
 */
class PhysicsMesh extends THREE.Mesh {
	readonly guid: string;

	constructor(physicsOpts?: CANNON.BodyOptions, geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[]) {
		super(geometry, material)

		this.guid = Math.floor(Math.random() * 100000) + '';
		const geometry_type: GEOMETRY_TYPE = getGeometryType(geometry); 

		cannon_worker.addBody(
			this.guid, 
			geometry_type,
			(geometry as THREE.BoxGeometry | THREE.PlaneGeometry).parameters,
			{x: this.position.x, y: this.position.y, z: this.position.z},
			{x: this.quaternion.x, y: this.quaternion.y, z: this.quaternion.z, w: this.quaternion.w},
			physicsOpts
		)
		.catch(e => console.error(e))
	}

	updateBodyPositionQuaternion() {
		try {
			cannon_worker.updateBodyPositionQuaternion(
				this.guid, 
				simplifyPosition(this.position), 
				simplifyQuaternion(this.quaternion)
			);
		} catch (error) {
			console.log("Error updating position and quaternion", this);
		}
	}

	setMeshPosQuatFromBody(physics_body: CANNON.Body) {
		this.position.copy(physics_body.position as unknown as THREE.Vector3)
		this.quaternion.copy(physics_body.quaternion as unknown as THREE.Quaternion)
	}
}

/**
 * 
 */
class SceneWrapper {
	readonly fov: number = 75;
	readonly canvas: HTMLCanvasElement
	readonly scene: THREE.Scene 
	readonly renderer: THREE.WebGLRenderer
	readonly camera: THREE.PerspectiveCamera 
	readonly controls: OrbitControls 
	readonly clock: THREE.Clock
	cannon_debugger: any
	debug_cube_mesh: THREE.Mesh
	image_texture: THREE.Texture 
	image_cubes: Array<{three_object: THREE.Mesh, physics_body: CANNON.Body}>
	force_arrow_helper: ArrowHelper
	elapsedTime: number
	window_width: number = 0;
	window_height: number = 0;
	window_ratio: number = 0;
	scene_width: number = 50;
	scene_height: number = 0;
	container_group: THREE.Group;
	container_width: number = 0;
	container_height: number = 0;
	container_depth: number = 0; 
	image_width: number = 0;
	image_height: number = 0;
	image_ratio: number = 0;
	image_scale: number = 0;
	has_physics: boolean = false;
	readonly scene_border_percent: number = 0.1;
	readonly container_thickness: number = 0.1;
	readonly container_border_percent: number = 0.1;
	readonly scene_depth_percent: number = 0.2;
	readonly grid_size: number = 20;
	readonly grid_gap_percent: number = 0.003;

	constructor() {
		// Bindings
		this.onResize 						= this.onResize.bind(this); 
		this.updatePhysics 				= this.updatePhysics.bind(this); 
		this.tick 								= this.tick.bind(this);
		this.addDebugCube 				= this.addDebugCube.bind(this);
		this.addContainer 				= this.addContainer.bind(this);
		this.addImageCubes 				= this.addImageCubes.bind(this);
		this.addLights 						= this.addLights.bind(this);
		this.initSceneElements		= this.initSceneElements.bind(this);
		this.addForceArrow				= this.addForceArrow.bind(this);
		this.addAxesHelper				= this.addAxesHelper.bind(this);
		this.start								= this.start.bind(this);

		// Init Canvas
		this.canvas = document.querySelector('canvas.webgl')

		// Init Scene
		this.scene = new THREE.Scene()

		// Init Renderer
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas })
		this.renderer.setSize(null, null)
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		// this.renderer.physicallyCorrectLights = true;
    // this.renderer.shadowMap.enabled = true;
    // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

		// Init Camera
		this.camera = new THREE.PerspectiveCamera(this.fov, null, 0.1, 10000)
		this.scene.add(this.camera)

		// Init Orbit Controls
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
		
		// Init Timing / Updates
		this.clock = new THREE.Clock()

		// Start scene
		this.start();
	}

	async start() {
		await this.loadImage();

		// Add cannon debugger (kills perf because debugger needs a world in main thread)
		// const world = await cannon_worker.getWorld(); 
		// this.cannon_debugger = CannonDebugger(this.scene, world)

		// Resize
		window.addEventListener('resize', this.onResize); 
		this.onResize();

		// Init Timing / Updates
		this.elapsedTime = this.clock.getElapsedTime(); 

		requestAnimationFrame(this.tick);
	}

	async loadImage() {
		// Load Image
		const loader = new THREE.TextureLoader();
		this.image_texture = await loader.loadAsync('/textures/face.png');
		const image_natural_width = this.image_texture?.image?.naturalWidth || 0;
		const image_natural_height = this.image_texture?.image?.naturalHeight || 0;
		this.image_ratio = image_natural_width / image_natural_height; 
	}

	initSceneElements() {
		let obj: THREE.Object3D; 

		for( var i = this.scene.children.length - 1; i >= 0; i--) { 
			obj = this.scene.children[i];
			this.scene.remove(obj); 
		} 

		// Add Elements
		this.addAxesHelper();
		this.addForceArrow();
		// this.addDebugCube();
		this.addContainer(); 
		this.addImageCubes();
		this.addLights();
	}

	onResize() {
		// Update sizes
		this.window_width 			= window.innerWidth;
		this.window_height 			= window.innerHeight;
		this.window_ratio 			= this.window_height / this.window_width;
		this.scene_height 			= this.scene_width * this.window_ratio;
		this.container_width 		= this.scene_width;
		this.container_height		= this.scene_height;
		this.container_depth 		= (this.container_width * this.scene_depth_percent) + this.container_thickness;
		
		if(this.image_ratio > this.window_ratio) {
			this.container_width = this.scene_width;
			this.container_height = this.scene_width / this.image_ratio;
		}
		else {
			this.container_width = this.scene_height * this.image_ratio;
			this.container_height = this.scene_height;
		}

		this.image_width = this.container_width - (this.container_width * this.container_border_percent);
		this.image_height = this.container_height - (this.container_width * this.container_border_percent);


		// Update renderer
		this.renderer.setSize(this.window_width, this.window_height)
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

		// Update camera
		this.camera.aspect = this.window_width / this.window_height

		// Controls
		// this.controls.handleResize();

		// Update elements based on new size
		this.initSceneElements();

		// 
		fitCameraToCenteredObject(this.camera, this.container_group, null, this.controls); 
	}

	addAxesHelper() {
		const axes_helper = new THREE.AxesHelper();
		this.scene.add(axes_helper);
	}

	addForceArrow() {
		const dir = new THREE.Vector3(0, 0, 0); 
		dir.normalize();
		const origin = new THREE.Vector3(0, 0, 0); 
		this.force_arrow_helper = new THREE.ArrowHelper( dir, origin, 0, 0xff0000 );
		this.scene.add(this.force_arrow_helper)
	}

	addDebugCube() {
    const cube_geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const cube_mat = new THREE.MeshNormalMaterial();
    this.debug_cube_mesh = new THREE.Mesh(cube_geo, cube_mat);
		this.debug_cube_mesh.position.set(0, 0, 0);
    this.scene.add(this.debug_cube_mesh);

		console.log('debug');
		// this.camera.position.set(0, 0, -1);
		// this.camera.lookAt(cube_mesh.position);

		// const cube_two_geo = new THREE.BoxGeometry(28, 15, 8);
    // const cube_two_mat = new THREE.MeshBasicMaterial({color: 'red'});
    // const cube_two_mesh = new PhysicsMesh({mass: 0}, cube_two_geo, cube_two_mat);
		// cube_two_mesh.position.set(10, 10, 10); 
		// cube_two_mesh.updateBodyPositionQuaternion();
    // this.scene.add(cube_two_mesh);
	}

	addContainer() {
		this.container_group = new THREE.Group();
		const container_thickness = this.container_thickness;
		console.log(container_thickness);
		
		const container_mat = new THREE.MeshStandardMaterial();
		const container_physics_opts = {
			type: CANNON.BODY_TYPES.STATIC,
			material: concreteMaterial,
			mass: 0,
		}

		const total_width = this.container_width + container_thickness;
		const total_height = this.container_height + container_thickness;

		// Back
		const box_back_geometry = new THREE.BoxGeometry(total_width, total_height, container_thickness);
		const box_back_material = container_mat.clone(); 
		const box_back_mesh			= new PhysicsMesh(container_physics_opts, box_back_geometry, box_back_material);
		box_back_mesh.position.set(0, 0, -this.container_depth / 2); 
		box_back_mesh.updateBodyPositionQuaternion(); 

		// Left
		const box_left_geometry = new THREE.BoxGeometry(container_thickness, total_height, this.container_depth);
		const box_left_material = container_mat.clone(); 
		const box_left_mesh			= new PhysicsMesh(container_physics_opts, box_left_geometry, box_left_material);
		box_left_mesh.position.set(-total_width / 2, 0, 0); 
		box_left_mesh.updateBodyPositionQuaternion();
		
		// Right
		const box_right_geometry = new THREE.BoxGeometry(container_thickness, total_height, this.container_depth);
		const box_right_material = container_mat.clone(); 
		const box_right_mesh			= new PhysicsMesh(container_physics_opts, box_right_geometry, box_right_material);
		box_right_mesh.position.set(total_width / 2, 0, 0); 
		box_right_mesh.updateBodyPositionQuaternion();

		// Top
		const box_top_geometry = new THREE.BoxGeometry(total_width, container_thickness, this.container_depth);
		const box_top_material = container_mat.clone(); 
		const box_top_mesh			= new PhysicsMesh(container_physics_opts, box_top_geometry, box_top_material);
		box_top_mesh.position.set(0, total_height / 2, 0); 
		box_top_mesh.updateBodyPositionQuaternion();

		// Bottom
		const box_bottom_geometry = new THREE.BoxGeometry(total_width, container_thickness, this.container_depth);
		const box_bottom_material = container_mat.clone(); 
		const box_bottom_mesh			= new PhysicsMesh(container_physics_opts, box_bottom_geometry, box_bottom_material);
		box_bottom_mesh.position.set(0, -total_height / 2, 0); 
		box_bottom_mesh.updateBodyPositionQuaternion();

    this.container_group.add(box_back_mesh)
    this.container_group.add(box_left_mesh)
    this.container_group.add(box_right_mesh)
    this.container_group.add(box_top_mesh)
    this.container_group.add(box_bottom_mesh)
		this.scene.add(this.container_group);
		const box = new THREE.BoxHelper( this.container_group, 0xffff00 );
		this.scene.add( box );
	}

	addImageCubes() {
		const gap_size = this.image_width * this.grid_gap_percent;
		const total_gap_size = Math.max((this.grid_size - 1), 0) * gap_size;
		const col_size = (this.image_width - total_gap_size) / this.grid_size; 
		const row_size = (this.image_height - total_gap_size) / this.grid_size; 
		const image_depth = this.container_depth * 0.5;
		const x_left = -this.image_width / 2;
		const y_top = -this.image_height / 2;

    for(let c = 0; c < this.grid_size; c++) {
			for(let r = 0; r < this.grid_size; r++) {
				const x = x_left + (col_size * (c + 1)) + (gap_size * Math.max(c, 0)) - (col_size / 2);
				const y = y_top + (row_size * (r + 1)) + (gap_size * Math.max(r, 0)) - (row_size / 2);

				const cube_geo = new THREE.BoxGeometry(col_size, row_size, image_depth, 1, 1, 1);
				const cube_mat = new THREE.MeshBasicMaterial()
				const cube_mesh = new PhysicsMesh({
					mass: 1,
					material: plasticMaterial
				}, cube_geo, cube_mat); 
				cube_mesh.castShadow = true;
				cube_mesh.receiveShadow = true;
				cube_mesh.position.set(x, y, 0);
				cube_mesh.updateBodyPositionQuaternion();
				
				cube_mat.map = this.image_texture.clone();
				cube_mat.map.repeat.set(1 / this.grid_size, 1 / this.grid_size)
				cube_mat.map.offset.set(c / this.grid_size, r / this.grid_size);
		
				this.scene.add(cube_mesh);
			}
    }
	}

	addLights() {
    // Add light
    const aLight1 = new THREE.AmbientLight(color_white, .3);
    this.scene.add(aLight1);

    // Add light
    const dLight1 = new THREE.DirectionalLight(color_white, 0.8);
    dLight1.castShadow = true;
    dLight1.position.set(5, 5, 10);
		// dLight1.target = this.image_cubes[0].three_object;
		this.scene.add(dLight1);

		// Add light
		const dLight2 = new THREE.DirectionalLight(color_white, 0.3);
		dLight2.castShadow = true;
		dLight2.position.set(-30, -30, 20);
		// dLight2.target = this.image_cubes[0].three_object;
		this.scene.add(dLight2);
	}

	// onWorkerMessage(e: MessageEvent) {
	// 	const type: WORKER_MESSAGE = e.data.type; 
	// 	const data: any = e.data.data; 

	// 	switch(type) {
	// 		case WORKER_MESSAGE.INIT_PHYSICS:

	// 		case WORKER_MESSAGE.TICK: 
	// 			this.scene.traverse(object => {
	// 				if(object instanceof PhysicsMesh) {
	// 					const guid = object.guid;

	// 					// object.physics_body.applyForce(threeToCannonVec(lookAtVector), object.physics_body.position);
	// 					// object.setMeshPosQuatFromBody()
	// 				}
	// 			})
	// 	}
	
		// // Get fresh data from the worker
		// positions = e.data.positions;
		// quaternions = e.data.quaternions;

		// // Update rendering meshes
		// for(var i=0; i!==meshes.length; i++){
		// 		meshes[i].position.set( positions[3*i+0],
		// 														positions[3*i+1],
		// 														positions[3*i+2] );
		// 		meshes[i].quaternion.set(quaternions[4*i+0],
		// 															quaternions[4*i+1],
		// 															quaternions[4*i+2],
		// 															quaternions[4*i+3]);
		// }

		// // If the worker was faster than the time step (dt seconds), we want to delay the next timestep
		// var delay = dt * 1000 - (Date.now()-sendTime);
		// if(delay < 0){
		// 		delay = 0;
		// }
		// setTimeout(sendDataToWorker,delay);
	// }

	updatePhysics() {
		// var lookAtVector = new THREE.Vector3(0,0, -1);
		// lookAtVector.applyQuaternion(this.camera.quaternion);
		// lookAtVector.z = 0;
		// lookAtVector.normalize();

		// const force = 10; 
		// this.force_arrow_helper.setLength(10); 
		// this.force_arrow_helper.setDirection(lookAtVector);
		// lookAtVector.multiplyScalar(force)



		// this.cannon_debugger.update();
	}

	tick() {
		// Call tick again on the next frame
		window.requestAnimationFrame(this.tick)

		// Update controls
		this.controls.update()

		// Update world
		this.updatePhysics()
		
		// Render
		this.renderer.render(this.scene, this.camera)
	}
}

export default new SceneWrapper();
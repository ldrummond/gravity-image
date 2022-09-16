import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es'
import { Object3D } from 'three';

const color_black = 0x000000;
const color_white = 0xFFFFFF;

const threeToCannonVec = (vec: THREE.Vector3): CANNON.Vec3 => {
    return new CANNON.Vec3(vec.x, vec.y, vec.z); 
}

const cannonToThreeVec = (vec: CANNON.Vec3): THREE.Vector3 => {
	return new THREE.Vector3(vec.x, vec.y, vec.z); 
}

const parametersToVec = (params: {width: number, height: number, depth: number}) => {
    return new THREE.Vector3(params.width, params.height, params.depth); 
}

const moveCameraToFitBounds = (camera: THREE.PerspectiveCamera, width: number, height: number, fov: number): void => {
	const side = Math.max(width, height);
	// Move the camera z to fit the box
	camera.position.z = side / Math.tan(Math.PI * fov / 360);
}

/**
 * 
 */
class PhysicsMesh extends THREE.Mesh {
	physics_body: CANNON.Body;

	constructor(physicsOpts?: CANNON.BodyOptions) {
		super()

		const physics_opts = {
			mass: 1, 
			...physicsOpts
		}

		const geometry = this.geometry;
		let physics_shape; 

		if(geometry instanceof THREE.BoxGeometry) {
			const { width, height, depth } = geometry.parameters;
			const half_extents = new CANNON.Vec3(width / 2, height / 2, depth / 2);
			physics_shape = new CANNON.Box(half_extents)
		}
		else {
			console.error("Create physics config for geometry:", geometry);
		}
		this.physics_body = new CANNON.Body({
			shape: physics_shape,
			mass: 1, 
			...physics_opts
		})
	}

	updatePhysics() {
		this.position.copy(cannonToThreeVec(this.physics_body.position));
		const { x, y, z, w } = this.physics_body.quaternion;
		this.quaternion.copy(new THREE.Quaternion(x, y, z, w));
	}
}

/**
 * 
 */
class SceneWrapper {
	canvas: HTMLCanvasElement
	scene: THREE.Scene 
	renderer: THREE.WebGLRenderer
	camera: THREE.PerspectiveCamera 
	controls: OrbitControls 
	world: CANNON.World
	fov: number
	image_texture: THREE.Texture 
	image_cubes: Array<{three_object: THREE.Mesh, physics_body: CANNON.Body}>
	vars: {
		window_width: number,
		window_height: number,
		window_ratio: number,
		scene_width: number,
		scene_height: number,
		container_width: number,
		container_height: number,
		image_width: number,
		image_height: number,
		image_scale: number,
		scene_border: number,
		container_border: number,
		scene_depth: number,
		grid_size: number,
		has_physics: boolean
	}
	clock: THREE.Clock
	elapsedTime: number

	constructor() {
		this.init = this.init.bind(this);
		this.init();
	}

	async init() {
		// Bindings
		this.onResize 			= this.onResize.bind(this); 
		this.updatePhysics 	= this.updatePhysics.bind(this); 
		this.tick 					= this.tick.bind(this);
		this.addDebugCube 	= this.addDebugCube.bind(this);
		this.addContainer 	= this.addContainer.bind(this);
		this.addImageCubes 	= this.addImageCubes.bind(this);
		this.addLights 			= this.addLights.bind(this);

		// Init Canvas
		this.canvas = document.querySelector('canvas.webgl')

		// Init Scene
		this.scene = new THREE.Scene()

		// Init Physics
		this.world = new CANNON.World({
			gravity: new CANNON.Vec3(0, 0, 0),
		})

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
		
		// Vars
		// TODO: Move some vars to consts
		this.fov = 75; 
		this.vars = {
			window_width: 0,
			window_height: 0,
			window_ratio: 0,
			scene_width: 50,
			scene_height: 0,
			container_width: 0,
			container_height: 0,
			image_width: 0,
			image_height: 0, 
			image_scale: 1,
			scene_border: 1,
			container_border: 10,
			scene_depth: 10,
			grid_size: 2,
			has_physics: false
		};
		this.vars.container_width = this.vars.scene_width - this.vars.scene_border;
		this.vars.image_width 		= this.vars.container_width - this.vars.container_border;

		// Resize
		window.addEventListener('resize', this.onResize); 
		this.onResize();

		// Load Image
		const loader = new THREE.TextureLoader();
		this.image_texture = await loader.loadAsync('/textures/catapillar.jpg');
		const image_natural_width = this.image_texture?.image?.naturalWidth || 0;
		const image_natural_height = this.image_texture?.image?.naturalHeight || 0;

		// Scale longest side of image to fixed size 
		if(image_natural_width > image_natural_height) {
			this.vars.image_scale = this.vars.image_width / image_natural_width;
		} else {
			this.vars.image_scale = this.vars.image_width / image_natural_height;
		}

		// Vars
		// const grid_size = 2; // MUST BE POWER OF TWO 
    // const grid_gap = 50; 
		// const total_gap = (grid_size - 1) * grid_gap; 
    // const col_size = image_width / grid_size; 
    // const row_size = image_height / grid_size; 
    // this.image_texture.repeat.set(1 / grid_size, 1 / grid_size);

		// Add Elements
		// this.addDebugCube();
		this.addContainer(); 
		this.addImageCubes();
		this.addLights();

		// Move camera to fit image
		moveCameraToFitBounds(this.camera, this.vars.scene_width, this.vars.scene_height, this.fov); 

		// Add axes helper
		const axes_helper = new THREE.AxesHelper();
		this.scene.add(axes_helper);

		// Init Timing / Updates
		this.clock = new THREE.Clock()
		this.elapsedTime = this.clock.getElapsedTime(); 

		requestAnimationFrame(this.tick);
	}

	onResize() {
		// Update sizes
		this.vars.window_width 			= window.innerWidth;
		this.vars.window_height 		= window.innerHeight;
		this.vars.window_ratio 			= this.vars.window_height / this.vars.window_width;
		this.vars.scene_height 			= this.vars.scene_width * this.vars.window_ratio;
		this.vars.container_width 	= this.vars.scene_width - this.vars.scene_border;
		this.vars.container_height 	= this.vars.container_width * this.vars.window_ratio;
		this.vars.image_width       = this.vars.container_width - this.vars.container_border;
		this.vars.image_height      = this.vars.container_height - this.vars.container_border;
		
		// Update camera
		this.camera.aspect = this.vars.window_width / this.vars.window_height
		this.camera.updateProjectionMatrix()
		moveCameraToFitBounds(this.camera, this.vars.scene_width, this.vars.scene_height, this.fov); 

		// Update renderer
		this.renderer.setSize(this.vars.window_width, this.vars.window_height)
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	}

	addDebugCube() {
    const cube_geo = new THREE.BoxGeometry(28, 28, 1); 
    const cube_mat = new THREE.MeshNormalMaterial();
    const cube_mesh = new THREE.Mesh(cube_geo, cube_mat);
    this.scene.add(cube_mesh);
	}

	updatePhysics() {
		this.world.fixedStep();
		this.scene.traverse(object => {
			if(object instanceof PhysicsMesh) {
				object.updatePhysics()
			}
		})
	}

	addContainer() {
		// Build container cube 
    const container_geometry = new THREE.BoxGeometry(this.vars.container_width, this.vars.container_height, this.vars.scene_depth); 
    const container_material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, });
    const container_mesh = new THREE.Mesh(container_geometry, [
			container_material, 
			container_material, 
			container_material, 
			container_material, 
			null, 
			container_material
		]);
		container_mesh.castShadow = true;
		container_mesh.receiveShadow = true;
    this.scene.add(container_mesh)

		// Physics
    // const container_physics_shape = new CANNON.Box(threeToCannonVec(parametersToVec(container_geometry.parameters)));
    // const container_physics_body = new CANNON.Body({ 
    //     mass: 1, 
    //     shape: container_physics_shape, 
    //     type: CANNON.BODY_TYPES.STATIC, 
    //     position: threeToCannonVec(container_mesh.position)  
    // })
    // container_mesh.receiveShadow = true; 
    // this.world.addBody(container_physics_body); 
	}

	addImageCubes() {
    // Store physics bodies
    this.image_cubes = []

		const image_geometry	= new THREE.BoxGeometry(this.vars.image_width, this.vars.image_height, this.vars.scene_depth);
		const image_material	= new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
		image_material.map = this.image_texture.clone();
		// const image_mesh = new THREE.Mesh(image_geometry, [null, null, null, null, image_material, null, null]); 
		const image_mesh = new THREE.Mesh(image_geometry, image_material); 
		image_mesh.castShadow = true;
		image_mesh.receiveShadow = true;
		image_mesh.position.z = 1;
		this.image_cubes.push({three_object: image_mesh, physics_body: new CANNON.Body()})
		this.scene.add(image_mesh);

    // for(let c = 0; c < this.vars.grid_size; c++) {
		// 	for(let r = 0; r < this.vars.grid_size; r++) {
		// 		const x = col_size * c - image_width / 2 + col_size / 2 - total_gap / 2 + (grid_gap * c - 1);
		// 		const y = row_size * r - image_height / 2 + row_size / 2 - total_gap / 2 + (grid_gap * r - 1);

		// 		const cube_physics_extents  = new CANNON.Vec3(cube_geo.depth, cube_geo.height)
		// 		const cube_geo = new THREE.BoxGeometry(col_size, row_size, scene_depth, 1, 1, 1);
		// 		const cube_mat = new THREE.MeshBasicMaterial({ color: 'green' })
				
		// 		const cube_physics_shape    = new CANNON.Box(cube_physics_extents);
		// 		const cube_physics_body = new CANNON.Body({
		// 		    mass: 1, 
		// 		    position: new CANNON.Vec3(x, y, this.vars.scene_depth),
		// 		    shape: cube_physics_shape,
		// 		    // material: defaultMaterial
		// 		})

				
		// 		cube_mat.map = this.image_texture.clone();
		// 		cube_mat.map.offset.set(c / grid_size, r / grid_size);
				
		// 		// const cube_mesh = new THREE.Mesh(cube_geo, [null, null, null, null, cube_mat, null, null]); 
		// 		const cube_mesh = new THREE.Mesh(cube_geo, cube_mat);
		// 		cube_mesh.position.copy(cube_physics_body.position); 

		// 		world.addBody(cube_physics_body);
		// 		scene.add(cube_mesh);

		// 		cubes.push({
		// 		    three: cube_mesh,
		// 		    physics: cube_physics_body
		// 		})
		// 	}
    // }
	}

	addLights() {
    // Add light
    const aLight1 = new THREE.AmbientLight(color_white, .3);
    this.scene.add(aLight1);

    // Add light
    const dLight1 = new THREE.DirectionalLight(color_white, 0.8);
    dLight1.castShadow = true;
    dLight1.position.set(5, 5, 10);
		dLight1.target = this.image_cubes[0].three_object;
		this.scene.add(dLight1);

		// Add light
		const dLight2 = new THREE.DirectionalLight(color_white, 0.3);
		dLight2.castShadow = true;
		dLight2.position.set(-30, -30, 20);
		dLight2.target = this.image_cubes[0].three_object;
		this.scene.add(dLight2);
	}

	tick() {
		// Call tick again on the next frame
		window.requestAnimationFrame(this.tick)
		// const prevTime = this.elapsedTime; 
		// this.elapsedTime = this.clock.getElapsedTime()

		// Update world
		if(this.vars.has_physics) {
			this.updatePhysics()
		}

		// Update controls
		this.controls.update()

		// Render
		this.renderer.render(this.scene, this.camera)
	}
}

export default new SceneWrapper();


// async function main() {
//     /**
//      * Base
//      */
//     // Canvas
//     const canvas: HTMLElement = document.querySelector('canvas.webgl')
    
//     // Scene
//     const scene = new THREE.Scene()
    

//     // Physics
//     const world = new CANNON.World({
//         gravity: new CANNON.Vec3(0, 0, 0),
//     })
//     // const defaultMaterial = new CANNON.Material('default')

//     /**
//      * Camera
//      */
//     // Base camera
//     const fov = 75; 
//     const camera = new THREE.PerspectiveCamera(fov, sizes.width / sizes.height, 0.1, 10000)
//     camera.position.x = 0
//     camera.position.y = 0
//     scene.add(camera)
    
//     const loader = new THREE.TextureLoader();
//     const this.image_texture = await loader.loadAsync('/textures/catapillar.jpg');

//     const image_width = this.image_texture.image.naturalWidth;
//     const image_height = this.image_texture.image.naturalHeight; 
//     const grid_size = 2; // MUST BE POWER OF TWO 
//     const grid_gap = 50; 
//     const scene_depth = 1000; 
//     const border = 1000; 
//     const total_gap = (grid_size - 1) * grid_gap; 
//     const col_size = image_width / grid_size; 
//     const row_size = image_height / grid_size; 
//     this.image_texture.repeat.set(1 / grid_size, 1 / grid_size);

//     // Build container cube 
//     const container_geometry = new THREE.BoxGeometry(image_width + border * 2, image_height + border * 2, scene_depth); 
//     const container_material = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8, metalness: 0.5 });
//     const container_mesh = new THREE.Mesh(container_geometry, container_material);
//     const container_physics_shape = new CANNON.Box(threeToCannonVec(parametersToVec(container_geometry.parameters)));
//     const container_physics_body = new CANNON.Body({ 
//         mass: 1, 
//         shape: container_physics_shape, 
//         type: CANNON.BODY_TYPES.STATIC, 
//         position: threeToCannonVec(container_mesh.position)  
//     })
//     container_mesh.receiveShadow = true; 
//     scene.add(container_mesh)
//     world.addBody(container_physics_body); 

//     // // Add "Back"
//     // const back_width = image_width + border * 2;
//     // const back_height = image_height + border * 2;
//     // const back_physics_shape = new CANNON.Plane(back_width, back_height);
//     // console.log(back_physics_shape);
//     // const back_physics_body  = new CANNON.Body({
//     //     mass: 1, 
//     //     type: CANNON.BODY_TYPES.STATIC,
//     //     position: new CANNON.Vec3(0, 0, scene_depth / 2),
//     //     shape: back_physics_shape,
//     //     // material: defaultMaterial
//     // })
//     // const back_geo          = new THREE.PlaneGeometry(back_width, back_height);
//     // const back_mat          = new THREE.MeshBasicMaterial({ color: 'blue' })
//     // const back_mesh         = new THREE.Mesh(back_geo, back_mat); 
//     // back_mesh.position.copy(back_physics_body.position);
//     // back_mesh.quaternion.copy(back_physics_body.quaternion);

//     // scene.add(back_mesh)
//     // world.addBody(back_physics_body); 

//     // // Build walls
//     // const addWall = (plane_width, plane_height, plane_x, plane_y, plane_z, rotate_y = 0) => {
//     //     const wall_physics_shape = new CANNON.Plane(plane_width, plane_height);
//     //     const wall_physics_body  = new CANNON.Body({
//     //         mass: 1, 
//     //         type: CANNON.BODY_TYPES.STATIC,
//     //         position: new CANNON.Vec3(plane_x, plane_y, plane_z),
//     //         shape: wall_physics_shape,
//     //         // material: defaultMaterial
//     //     })
//     //     wall_physics_body.quaternion.setFromEuler(Math.PI / 2, rotate_y, 0)

//     //     const wall_geo          = new THREE.PlaneGeometry(plane_width, plane_height);
//     //     const wall_mat          = new THREE.MeshBasicMaterial({ color: 'red', side: THREE.DoubleSide })
//     //     const wall_mesh         = new THREE.Mesh(wall_geo, wall_mat); 
//     //     wall_mesh.position.copy(wall_physics_body.position);
//     //     wall_mesh.quaternion.copy(wall_physics_body.quaternion);
         
//     //     scene.add(wall_mesh)
//     //     world.addBody(wall_physics_body); 
//     // }
    
//     // // Top
//     // addWall(image_width + border * 2, scene_depth, 0, -image_height / 2 - border, scene_depth / 2); 
//     // // Left
//     // addWall(image_height + border * 2, scene_depth, -image_width / 2 - border, 0, scene_depth / 2, Math.PI / 2);
//     // // Right
//     // addWall(image_height + border * 2, scene_depth, image_width / 2 + border, 0, scene_depth / 2, Math.PI / 2);
//     // // Bottom
//     // addWall(image_width + border * 2, scene_depth, 0, image_height / 2 + border, scene_depth / 2);
    
//     // Fit image to camera
//     camera.position.z = (image_height + total_gap + (border * 2)) / 2 / Math.tan(Math.PI * fov / 360) * 1.2;
    
//     // Store physics bodies
//     let cubes = []

//     for(let c = 0; c < grid_size; c++) {
//         for(let r = 0; r < grid_size; r++) {
//             // const x = col_size * c - image_width / 2 + col_size / 2 - total_gap / 2 + (grid_gap * c - 1);
//             // const y = row_size * r - image_height / 2 + row_size / 2 - total_gap / 2 + (grid_gap * r - 1);

//             // const cube_physics_extents  = new CANNON.Vec3(container_geometry = new THREE.BoxGeometry(image_width, image_height + border * 2).width, cube_geo.depth, cube_geo.height)
//             // const cube_geo = new THREE.BoxGeometry(col_size, row_size, scene_depth, 1, 1, 1);
//             // const cube_mat = new THREE.MeshBasicMaterial({ color: 'green' })
            
//             // const cube_physics_shape    = new CANNON.Box(cube_physics_extents);
//             // const cube_physics_body = new CANNON.Body({
//             //     mass: 1, 
//             //     position: new CANNON.Vec3(x, y, scene_depth),
//             //     shape: cube_physics_shape,
//             //     // material: defaultMaterial
//             // })

            
//             // cube_mat.map = this.image_texture.clone();
//             // cube_mat.map.offset.set(c / grid_size, r / grid_size);
            
//             // // const cube_mesh = new THREE.Mesh(cube_geo, [null, null, null, null, cube_mat, null, null]); 
//             // const cube_mesh = new THREE.Mesh(cube_geo, cube_mat);
//             // cube_mesh.position.copy(cube_physics_body.position); 

//             // world.addBody(cube_physics_body);
//             // scene.add(cube_mesh);

//             // cubes.push({
//             //     three: cube_mesh,
//             //     physics: cube_physics_body
//             // })
//         }
//     }



    
//     /**
//      * Renderer
//      */
//     const renderer = new THREE.WebGLRenderer({
//         canvas: canvas
//     })
//     renderer.setSize(sizes.width, sizes.height)
//     renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
//     // renderer.physicallyCorrectLights = true;
//     // renderer.shadowMap.enabled = true;
//     // renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

// }

// export default main();
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export const concreteMaterial = new CANNON.Material('concrete')
export const plasticMaterial = new CANNON.Material('plastic')

export enum GEOMETRY_TYPE {
  PLANE_GEOMETRY="PLANE_GEOMETRY",
  BOX_GEOMETRY="BOX_GEOMETRY"
}

export function getGeometryType(geometry: THREE.BufferGeometry): GEOMETRY_TYPE {
  if(geometry instanceof THREE.PlaneGeometry) return GEOMETRY_TYPE.PLANE_GEOMETRY; 
  else if(geometry instanceof THREE.BoxGeometry) return GEOMETRY_TYPE.BOX_GEOMETRY; 
  else console.error("Create physics config for geometry:", geometry);
}

export interface simple_position {
  x: number,
  y: number,
  z: number
} 

export interface simple_quaternion {
  x: number,
  y: number,
  z: number,
  w: number
}

export const threeToCannonVec = (vec: THREE.Vector3): CANNON.Vec3 => {
	return new CANNON.Vec3(vec.x, vec.y, vec.z); 
}

export function simplifyPosition(position: THREE.Vector3 | CANNON.Vec3): simple_position {
	return {x: position.x, y: position.y, z: position.z}
}

export function simplifyQuaternion(quaternion: THREE.Quaternion | CANNON.Quaternion): simple_quaternion {
	return {x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w}
}

export const cannonToThreeVec = (vec: CANNON.Vec3): THREE.Vector3 => {
	return new THREE.Vector3(vec.x, vec.y, vec.z); 
}

export const parametersToVec = (params: {width: number, height: number, depth: number}) => {
	return new THREE.Vector3(params.width, params.height, params.depth); 
}

export const moveCameraToFitBounds = (camera: THREE.PerspectiveCamera, width: number, height: number, fov: number): void => {
	const side = Math.max(width, height);
	// Move the camera z to fit the box
	camera.position.z = side / Math.tan(Math.PI * fov / 360);
}

export const fitCameraToCenteredObject = function (camera: THREE.PerspectiveCamera, object: THREE.Object3D, offset: number, orbitControls: OrbitControls ) {
	const boundingBox = new THREE.Box3();
	boundingBox.setFromObject( object );

	var middle = new THREE.Vector3();
	var size = new THREE.Vector3();
	boundingBox.getSize(size);

	// figure out how to fit the box in the view:
	// 1. figure out horizontal FOV (on non-1.0 aspects)
	// 2. figure out distance from the object in X and Y planes
	// 3. select the max distance (to fit both sides in)
	//
	// The reason is as follows:
	//
	// Imagine a bounding box (BB) is centered at (0,0,0).
	// Camera has vertical FOV (camera.fov) and horizontal FOV
	// (camera.fov scaled by aspect, see fovh below)
	//
	// Therefore if you want to put the entire object into the field of view,
	// you have to compute the distance as: z/2 (half of Z size of the BB
	// protruding towards us) plus for both X and Y size of BB you have to
	// figure out the distance created by the appropriate FOV.
	//
	// The FOV is always a triangle:
	//
	//  (size/2)
	// +--------+
	// |       /
	// |      /
	// |     /
	// | F° /
	// |   /
	// |  /
	// | /
	// |/
	//
	// F° is half of respective FOV, so to compute the distance (the length
	// of the straight line) one has to: `size/2 / Math.tan(F)`.
	//
	// FTR, from https://threejs.org/docs/#api/en/cameras/PerspectiveCamera
	// the camera.fov is the vertical FOV.

	const fov = camera.fov * ( Math.PI / 180 );
	const fovh = 2 * Math.atan(Math.tan(fov/2) * camera.aspect);
	let dx = size.z / 2 + Math.abs( size.x / 2 / Math.tan( fovh / 2 ) );
	let dy = size.z / 2 + Math.abs( size.y / 2 / Math.tan( fov / 2 ) );
	let cameraZ = Math.max(dx, dy);

	// offset the camera, if desired (to avoid filling the whole canvas)
	if( offset && offset !== 0 ) cameraZ *= offset;

	camera.position.set( 0, 0, cameraZ );

	// set the far plane of the camera so that it easily encompasses the whole object
	const minZ = boundingBox.min.z;
	const cameraToFarEdge = ( minZ < 0 ) ? -minZ + cameraZ : cameraZ - minZ;

	camera.far = cameraToFarEdge * 3;
	camera.updateProjectionMatrix();

	if ( orbitControls ) {
			// set camera to rotate around the center
			orbitControls.target = new THREE.Vector3(0, 0, 0);

			// prevent camera from zooming out far enough to create far plane cutoff
			orbitControls.maxDistance = cameraToFarEdge * 2;
	}
};
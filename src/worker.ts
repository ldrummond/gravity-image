
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { concreteMaterial, plasticMaterial, GEOMETRY_TYPE, simple_position, simple_quaternion } from './utils';

/************************************************
Run Physics in worker for performance 
************************************************/

type CannonBodies = Record<string, CANNON.Body>

const bodies: CannonBodies = {};
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, -9.82) })
const concretePlasticContactMaterial = new CANNON.ContactMaterial(
  concreteMaterial,
  plasticMaterial,
  {
    friction: 0,
    restitution: 1
  }
)
world.addContactMaterial(concretePlasticContactMaterial)

export async function getWorld(): Promise<CANNON.World> {
  return world;
}

export async function addBody(
  guid: string, 
  geometry_type: GEOMETRY_TYPE, 
  geometry_parameters: THREE.BoxGeometry["parameters"] | THREE.PlaneGeometry["parameters"],
  position: simple_position, 
  quaternion: simple_quaternion, 
  physics_opts: CANNON.BodyOptions
): Promise<void> {

  let physics_shape; 
  if(geometry_type === GEOMETRY_TYPE.PLANE_GEOMETRY) {
    const { width, height } = geometry_parameters as THREE.PlaneGeometry["parameters"];
    const half_extents = new CANNON.Vec3(width / 2, height / 2, 1);
    physics_shape = new CANNON.Box(half_extents)
  }
  else if(geometry_type === GEOMETRY_TYPE.BOX_GEOMETRY) {
    const { width, height, depth } = geometry_parameters as THREE.BoxGeometry["parameters"];
    const half_extents = new CANNON.Vec3(width / 2, height / 2, depth / 2);
    physics_shape = new CANNON.Box(half_extents)
  }
  else {
    console.error("Couldn't add physics body");
  }
  
  const body = new CANNON.Body({
    shape: physics_shape,
    position: position as unknown as CANNON.Vec3,
    quaternion: quaternion as unknown as CANNON.Quaternion,
    ...physics_opts,
  })	
    
  bodies[guid] = body; 
  world.addBody(body)
}

export async function updateBodyPositionQuaternion(guid: string, position: simple_position, quaternion: simple_quaternion) {
  const physics_body = bodies[guid];
  if(physics_body instanceof CANNON.Body) {
    physics_body.position.copy(position as unknown as CANNON.Vec3);
    physics_body.quaternion.copy(quaternion as unknown as CANNON.Quaternion)
  }
}

export async function tick(): Promise<CannonBodies> {
  world.fixedStep();
  return bodies
}
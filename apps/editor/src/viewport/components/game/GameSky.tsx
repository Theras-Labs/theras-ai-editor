// A plain day sky for game mode, for scenes that have no sky of their own. The editor view has
// a dark background by design; at eye height that reads as a black void. This is a gradient
// dome that follows the camera. It is drawn only while the player has the camera, it is not in
// the scene document, and it never gets a collider.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import * as THREE from "three";
import { gameControlsActive, gameStore } from "@/lib/game/game-store";

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  vec3 color = mix(uGround, sky, smoothstep(-0.08, 0.02, h));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export function GameSky() {
  const game = useSnapshot(gameStore);
  const mesh = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uZenith: { value: new THREE.Color("#3f7fd0") },
          uHorizon: { value: new THREE.Color("#cfe6f7") },
          uGround: { value: new THREE.Color("#8fa3b3") }
        },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false
      }),
    []
  );
  const shown = gameControlsActive(game);

  // The dome stays centered on the camera, inside the far plane.
  useFrame(() => {
    if (!shown || !mesh.current) return;
    mesh.current.position.copy(camera.position);
    const far = (camera as THREE.PerspectiveCamera).far ?? 2000;
    mesh.current.scale.setScalar(Math.max(10, far * 0.9));
  });

  if (!shown) return null;
  return (
    <mesh frustumCulled={false} material={material} name="game-sky" ref={mesh} renderOrder={-1000} userData={{ noCollide: true }}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

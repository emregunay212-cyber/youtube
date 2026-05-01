import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { DijiCharacter, DijiAnimation } from "./DijiCharacter";

interface DijiSceneProps {
  animation?: DijiAnimation;
  width?: number;
  height?: number;
  // Sahne içindeki pozisyon: -1 sol, 0 merkez, 1 sağ
  position?: "left" | "center" | "right";
  showControls?: boolean;
}

const POSITION_MAP = {
  left:   [-1.5, -1, 0] as [number, number, number],
  center: [0,    -1, 0] as [number, number, number],
  right:  [1.5,  -1, 0] as [number, number, number],
};

const ROTATION_MAP = {
  left:   [0,  0.3, 0] as [number, number, number],
  center: [0,  0,   0] as [number, number, number],
  right:  [0, -0.3, 0] as [number, number, number],
};

export function DijiScene({
  animation = "idle",
  width = 400,
  height = 600,
  position = "center",
  showControls = false,
}: DijiSceneProps) {
  return (
    <Canvas
      style={{ width, height, background: "transparent" }}
      camera={{ position: [0, 0.5, 3.5], fov: 45 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} castShadow />
      <directionalLight position={[-2, 2, -1]} intensity={0.4} />

      <Suspense fallback={null}>
        <DijiCharacter
          animation={animation}
          position={POSITION_MAP[position]}
          rotation={ROTATION_MAP[position]}
          scale={1}
        />
        <Environment preset="studio" />
      </Suspense>

      {showControls && <OrbitControls />}
    </Canvas>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type DijiAnimation =
  | "idle"
  | "walk"
  | "run"
  | "talk"
  | "talk2"
  | "talk3"
  | "point"
  | "wave"
  | "look"
  | "thinking"
  | "nod"
  | "shake"
  | "shrug"
  | "clap"
  | "happy"
  | "surprised"
  | "yell"
  | "bow";

interface DijiCharacterProps {
  animation: DijiAnimation;
  baseModelUrl: string;
  animationUrl: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  fadeMs?: number;
}

export function DijiCharacter({
  animation,
  baseModelUrl,
  animationUrl,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  fadeMs = 350,
}: DijiCharacterProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const baseGltf = useLoader(GLTFLoader, baseModelUrl);
  const animGltf = useLoader(GLTFLoader, animationUrl);

  const cloned = useMemo(() => cloneSkeleton(baseGltf.scene), [baseGltf]);

  // Root bone'u tespit et (Mixamo: mixamorigHips, klasik: Hips, fallback: SkinnedMesh skeleton kökü)
  const rootBoneRef = useRef<THREE.Object3D | null>(null);
  useEffect(() => {
    let found: THREE.Object3D | null = null;
    cloned.traverse((obj) => {
      if (found) return;
      const n = obj.name || "";
      if (/Hips/i.test(n) || /Spine/i.test(n) === false && obj.type === "Bone" && !((obj.parent as any)?.isBone)) {
        if (/Hips/i.test(n)) found = obj;
      }
    });
    // Fallback: SkinnedMesh skeleton'unun ilk bone'u (genelde root = Hips)
    if (!found) {
      cloned.traverse((obj) => {
        if (found) return;
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
          const skel = (obj as THREE.SkinnedMesh).skeleton;
          if (skel && skel.bones.length > 0) {
            // Skeleton'da en üstteki bone (parent'ı bone olmayan)
            for (const b of skel.bones) {
              if (!(b.parent as any)?.isBone) {
                found = b;
                break;
              }
            }
          }
        }
      });
    }
    rootBoneRef.current = found;
  }, [cloned]);

  // Sadece root motion içeren track'ları filtrele
  // (X veya Z'de >0.05 birim hareket = root motion. Ayak/topuk bone'ları sabit pozisyondadır.)
  const animClip = useMemo(() => {
    const original = animGltf.animations[0];
    if (!original) return null;
    const clip = original.clone();
    clip.tracks = clip.tracks.map((track) => {
      if (!track.name.endsWith(".position")) return track;
      const values = (track as THREE.VectorKeyframeTrack).values;
      let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i < values.length; i += 3) {
        if (values[i] < xMin) xMin = values[i];
        if (values[i] > xMax) xMax = values[i];
        if (values[i + 2] < zMin) zMin = values[i + 2];
        if (values[i + 2] > zMax) zMax = values[i + 2];
      }
      const xRange = xMax - xMin;
      const zRange = zMax - zMin;
      // Bu bone X veya Z'de hareketli değilse (ayak gibi sabit), olduğu gibi bırak
      if (xRange < 0.05 && zRange < 0.05) return track;

      // Bu root motion içeren bir track — X, Y, Z hepsini frame 0 değerlerine kilitle
      // (bind pose'un position'ı animasyondan etkilenmesin, Y snap önlensin)
      const cloned = track.clone() as THREE.VectorKeyframeTrack;
      const newValues = cloned.values;
      const baseX = newValues[0];
      const baseY = newValues[1];
      const baseZ = newValues[2];
      for (let i = 0; i < newValues.length; i += 3) {
        newValues[i] = baseX;
        newValues[i + 1] = baseY;
        newValues[i + 2] = baseZ;
      }
      return cloned;
    });
    return clip;
  }, [animGltf]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const lastTimeRef = useRef<number>(timeSec);

  // Mixer setup
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(cloned);
    mixerRef.current = mixer;
    lastTimeRef.current = timeSec;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned]);

  // Animasyon değiştiğinde crossfade
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || !animClip) return;

    const newAction = mixer.clipAction(animClip);
    newAction.setLoop(THREE.LoopRepeat, Infinity);
    newAction.clampWhenFinished = false;
    newAction.enabled = true;

    if (actionRef.current && actionRef.current !== newAction) {
      newAction.reset();
      newAction.setEffectiveWeight(1);
      newAction.crossFadeFrom(actionRef.current, fadeMs / 1000, true);
      newAction.play();
    } else {
      newAction.reset().play();
    }
    actionRef.current = newAction;
  }, [animClip, animation, fadeMs]);

  // Her render'da mixer'ı delta ile sür (Remotion frame-perfect)
  const mixer = mixerRef.current;
  if (mixer) {
    let delta = timeSec - lastTimeRef.current;
    // Scrub-back veya ilk frame koruması
    if (delta < 0 || delta > 0.5) delta = 1 / fps;
    mixer.update(delta);
    lastTimeRef.current = timeSec;

    // Root motion'ı zorla sıfırla
    const root = rootBoneRef.current;
    if (root) {
      root.position.x = 0;
      root.position.z = 0;
    }
    // Scene root'un da pozisyonu animasyondan etkilenmesin — prop'tan gelen değeri zorla
    cloned.position.set(position[0], position[1], position[2]);
  }

  return (
    <primitive
      object={cloned}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

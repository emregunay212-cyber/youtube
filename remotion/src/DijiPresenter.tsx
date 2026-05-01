import { useCurrentFrame, useVideoConfig, AbsoluteFill, Audio, staticFile } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { Suspense, useMemo } from "react";
import { DijiCharacter, type DijiAnimation } from "../../src/components/diji/DijiCharacter";
import {
  planDijiBeats,
  getActiveBeat,
  getInterpolatedPosition,
  type SceneTiming,
} from "../../src/video/dijiScenePlan";

export interface DijiPresenterProps {
  scenes: SceneTiming[];
  audioSrc?: string;
  totalDurationSec: number;
  title?: string;
  subtitle?: string;
}

const ANIM_PATHS: Record<DijiAnimation, string> = {
  idle:      "characters/animations/idle.glb",
  walk:      "characters/animations/walk.glb",
  run:       "characters/animations/run.glb",
  talk:      "characters/animations/talk.glb",
  talk2:     "characters/animations/talk2.glb",
  talk3:     "characters/animations/talk3.glb",
  point:     "characters/animations/point.glb",
  wave:      "characters/animations/wave.glb",
  look:      "characters/animations/look.glb",
  thinking:  "characters/animations/thinking.glb",
  nod:       "characters/animations/nod.glb",
  shake:     "characters/animations/shake.glb",
  shrug:     "characters/animations/shrug.glb",
  clap:      "characters/animations/clap.glb",
  happy:     "characters/animations/happy.glb",
  surprised: "characters/animations/surprised.glb",
  yell:      "characters/animations/yell.glb",
  bow:       "characters/animations/bow.glb",
};

const BASE_MODEL_PATH = "characters/animations/idle.glb";

export const DijiPresenter: React.FC<DijiPresenterProps> = ({
  scenes,
  audioSrc,
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const plan = useMemo(() => planDijiBeats(scenes), [scenes]);
  const beat = getActiveBeat(plan.beats, timeMs);
  const animation = beat?.animation ?? "idle";
  let pos = getInterpolatedPosition(plan.waypoints, timeMs);

  // Walk/run sırasında karakter yüzü hareket yönüne dönsün
  if ((animation === "walk" || animation === "run") && beat) {
    const prev = [...plan.waypoints].reverse().find((w) => w.timeMs <= beat.startMs);
    const next = plan.waypoints.find((w) => w.timeMs >= beat.endMs);
    if (prev && next) {
      const dx = next.x - prev.x;
      if (Math.abs(dx) > 0.1) {
        // +X yönü = +0.6 rotY, -X yönü = -0.6 rotY (yarım profil)
        const targetRot = dx > 0 ? 0.6 : -0.6;
        // Beat içinde başında ve sonunda hızlıca dönüş — ortada walk yönü
        const beatT = (timeMs - beat.startMs) / (beat.endMs - beat.startMs);
        const blend = beatT < 0.2 ? beatT / 0.2 : beatT > 0.8 ? (1 - beatT) / 0.2 : 1;
        pos = { ...pos, rotY: pos.rotY + (targetRot - pos.rotY) * blend };
      }
    }
  }

  const currentScene =
    scenes.find((s) => timeMs >= s.startMs && timeMs < s.endMs) ??
    scenes[scenes.length - 1];

  const baseUrl = staticFile(BASE_MODEL_PATH);
  const animUrl = staticFile(ANIM_PATHS[animation]);

  const canvasWidth = Math.round(width * 0.45);
  const canvasHeight = height;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0a1628 0%, #1a2540 100%)" }}>
      {/* Slayt — sol alan */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 80,
          width: "55%",
          height: "75%",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(96,200,255,0.2)",
          borderRadius: 24,
          padding: 60,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {title && (
          <h1 style={{ fontSize: 56, color: "#60c8ff", fontFamily: "system-ui, sans-serif", margin: 0, lineHeight: 1.1 }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p style={{ fontSize: 28, color: "#aac8e8", fontFamily: "system-ui, sans-serif", margin: 0 }}>
            {subtitle}
          </p>
        )}
        {currentScene && (
          <p
            style={{
              fontSize: 32,
              color: "#fff",
              fontFamily: "system-ui, sans-serif",
              margin: 0,
              lineHeight: 1.5,
              marginTop: 20,
            }}
          >
            {currentScene.voiceover}
          </p>
        )}
      </div>

      {/* Diji — sağ taraf */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
        <ThreeCanvas width={canvasWidth} height={canvasHeight}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[2, 4, 3]} intensity={1.5} />
          <directionalLight position={[-2, 2, 1]} intensity={0.6} color="#88aaff" />
          <directionalLight position={[0, 1, -3]} intensity={0.4} color="#ffaa66" />
          <perspectiveCamera position={[0, 1, 4.5]} fov={35} />

          <Suspense fallback={null}>
            <DijiCharacter
              animation={animation}
              baseModelUrl={baseUrl}
              animationUrl={animUrl}
              position={[pos.x, -1, pos.z]}
              rotation={[0, pos.rotY, 0]}
              scale={1}
            />
          </Suspense>
        </ThreeCanvas>
      </div>

      {audioSrc && <Audio src={staticFile(audioSrc)} />}
    </AbsoluteFill>
  );
};

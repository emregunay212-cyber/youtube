import type { DijiAnimation } from "../components/diji/DijiCharacter";

export interface SceneTiming {
  id: number;
  startMs: number;
  endMs: number;
  voiceover: string;
  visualHint?: string;
}

/** Diji'nin sahnedeki durağı (3D koordinatlar) */
export interface Waypoint {
  timeMs: number;
  x: number;       // -2 (sol) .. 2 (sağ)
  z: number;       // 0 (varsayılan), ileri/geri
  rotY: number;    // radyan
}

/** Belirli bir zaman aralığında oynayacak animasyon */
export interface AnimBeat {
  startMs: number;
  endMs: number;
  animation: DijiAnimation;
}

export interface DijiPlan {
  waypoints: Waypoint[];
  beats: AnimBeat[];
}

// Sahnede 3 ana durak
const STATIONS = {
  right:  { x: 1.5,  rotY: -0.3 },
  center: { x: 0.0,  rotY:  0.0 },
  left:   { x: -1.2, rotY:  0.4 },
};

const TALK_VARIANTS: DijiAnimation[] = ["talk", "talk2", "talk3"];

const KEYWORDS: Array<[RegExp, DijiAnimation]> = [
  [/(şaşırtıcı|inanılmaz|vay|wow|bakın hele)/i, "surprised"],
  [/(düşünelim|merak ediyorsun|acaba|peki ya)/i, "thinking"],
  [/(bak şuna|burada|işte|şurada|şu noktada)/i, "point"],
  [/(evet|kesinlikle|aynen|doğru|tabii ki)/i, "nod"],
  [/(hayır|yanlış|asla|hiç de değil)/i, "shake"],
  [/(bilinmiyor|kim bilir|belki de|emin değiliz)/i, "shrug"],
  [/(harika|muhteşem|alkış|tebrikler)/i, "clap"],
  [/(dikkat|aman|durun|önemli)/i, "yell"],
];

function detectGesture(text: string): DijiAnimation | null {
  for (const [re, anim] of KEYWORDS) if (re.test(text)) return anim;
  return null;
}

const STATION_NAMES: Array<keyof typeof STATIONS> = ["right", "center", "left"];

/**
 * Bir sahneyi 2-3 segmentte planla:
 * - Walk: önceki duraktan yeni durağa yürüme (1.2s)
 * - Stay: yeni durakta konuşma + opsiyonel jest
 */
export function planDijiBeats(scenes: SceneTiming[]): DijiPlan {
  const waypoints: Waypoint[] = [];
  const beats: AnimBeat[] = [];

  let stationIdx = 0; // sağdan başla
  let prevStation = STATIONS[STATION_NAMES[stationIdx]];
  const t0 = scenes[0]?.startMs ?? 0;

  // Başlangıç waypoint
  waypoints.push({ timeMs: t0, x: prevStation.x, z: 0, rotY: prevStation.rotY });

  scenes.forEach((scene, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === scenes.length - 1;
    const dur = scene.endMs - scene.startMs;

    // İlk sahne: önce el sallasın
    if (isFirst) {
      const waveDur = Math.min(2500, dur * 0.4);
      beats.push({
        startMs: scene.startMs,
        endMs: scene.startMs + waveDur,
        animation: "wave",
      });
      // Geri kalanını talk olarak doldur
      beats.push({
        startMs: scene.startMs + waveDur,
        endMs: scene.endMs,
        animation: pickTalkOrGesture(scene.voiceover, idx),
      });
      // Bu sahnede yer değişmesin
      waypoints.push({ timeMs: scene.endMs, x: prevStation.x, z: 0, rotY: prevStation.rotY });
      return;
    }

    // Son sahne: sonda reverans + el salla
    if (isLast) {
      const farewell = 4000;
      const mainEnd = Math.max(scene.startMs + 1000, scene.endMs - farewell);

      // Yürüme + ana
      const walkDur = 1200;
      stationIdx = (stationIdx + 1) % STATION_NAMES.length;
      const newStation = STATIONS[STATION_NAMES[stationIdx]];

      beats.push({
        startMs: scene.startMs,
        endMs: scene.startMs + walkDur,
        animation: "walk",
      });
      waypoints.push({
        timeMs: scene.startMs + walkDur,
        x: newStation.x,
        z: 0,
        rotY: newStation.rotY,
      });
      beats.push({
        startMs: scene.startMs + walkDur,
        endMs: mainEnd,
        animation: pickTalkOrGesture(scene.voiceover, idx),
      });

      // Reverans + wave
      beats.push({
        startMs: mainEnd,
        endMs: scene.endMs - 2000,
        animation: "bow",
      });
      beats.push({
        startMs: scene.endMs - 2000,
        endMs: scene.endMs,
        animation: "wave",
      });
      waypoints.push({ timeMs: scene.endMs, x: newStation.x, z: 0, rotY: newStation.rotY });
      prevStation = newStation;
      return;
    }

    // Diğer sahneler: yürüme + konuşma + opsiyonel jest
    stationIdx = (stationIdx + 1) % STATION_NAMES.length;
    const newStation = STATIONS[STATION_NAMES[stationIdx]];
    const walkDur = Math.min(1300, dur * 0.2);

    // Yürüme
    beats.push({
      startMs: scene.startMs,
      endMs: scene.startMs + walkDur,
      animation: "walk",
    });
    waypoints.push({
      timeMs: scene.startMs + walkDur,
      x: newStation.x,
      z: 0,
      rotY: newStation.rotY,
    });

    // Konuşma kısmı (jest tetiklemesi varsa son saniyede ekle)
    const gesture = detectGesture(scene.voiceover);
    const remaining = scene.endMs - (scene.startMs + walkDur);

    if (gesture && remaining > 3500) {
      const gestureDur = 1500;
      beats.push({
        startMs: scene.startMs + walkDur,
        endMs: scene.endMs - gestureDur,
        animation: pickTalkOrGesture(scene.voiceover, idx),
      });
      beats.push({
        startMs: scene.endMs - gestureDur,
        endMs: scene.endMs,
        animation: gesture,
      });
    } else {
      beats.push({
        startMs: scene.startMs + walkDur,
        endMs: scene.endMs,
        animation: pickTalkOrGesture(scene.voiceover, idx),
      });
    }

    waypoints.push({ timeMs: scene.endMs, x: newStation.x, z: 0, rotY: newStation.rotY });
    prevStation = newStation;
  });

  return { waypoints, beats };
}

function pickTalkOrGesture(text: string, idx: number): DijiAnimation {
  return TALK_VARIANTS[idx % TALK_VARIANTS.length];
}

/** Belirli bir zamanda aktif beat */
export function getActiveBeat(beats: AnimBeat[], timeMs: number): AnimBeat | null {
  for (const beat of beats) {
    if (timeMs >= beat.startMs && timeMs < beat.endMs) return beat;
  }
  return beats[beats.length - 1] ?? null;
}

/** Waypoint'ler arasında pozisyon interpolasyonu (linear lerp + smoothstep) */
export function getInterpolatedPosition(
  waypoints: Waypoint[],
  timeMs: number
): { x: number; z: number; rotY: number } {
  if (!waypoints.length) return { x: 0, z: 0, rotY: 0 };
  if (timeMs <= waypoints[0].timeMs) return waypoints[0];
  if (timeMs >= waypoints[waypoints.length - 1].timeMs) {
    return waypoints[waypoints.length - 1];
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (timeMs >= a.timeMs && timeMs <= b.timeMs) {
      const t = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
      // Smoothstep — başlangıç ve sonu yumuşatır
      const s = t * t * (3 - 2 * t);
      // Rotasyon: en kısa yoldan dön
      let rotDelta = b.rotY - a.rotY;
      if (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
      if (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
      return {
        x: a.x + (b.x - a.x) * s,
        z: a.z + (b.z - a.z) * s,
        rotY: a.rotY + rotDelta * s,
      };
    }
  }
  return waypoints[0];
}

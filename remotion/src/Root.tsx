import { Composition } from "remotion";
import { DijiPresenter } from "./DijiPresenter";
import type { SceneTiming } from "../../src/video/dijiScenePlan";

// Demo veri — gerçek script.json + scene-timings.json yerine geçen örnek
const DEMO_SCENES: SceneTiming[] = [
  {
    id: 1,
    startMs: 0,
    endMs: 6000,
    voiceover:
      "Diji Zihin'e hoş geldin! Bugün sana inanılmaz bir hikaye anlatacağım.",
  },
  {
    id: 2,
    startMs: 6000,
    endMs: 14000,
    voiceover:
      "Düşünelim — bir genç kız, dokuz milyar dolarlık bir şirket kuruyor. Ama büyük bir sorun var.",
  },
  {
    id: 3,
    startMs: 14000,
    endMs: 22000,
    voiceover:
      "Bak şuna: cihazları çalışmıyor. Hiç çalışmamıştı. Şaşırtıcı, değil mi?",
  },
  {
    id: 4,
    startMs: 22000,
    endMs: 30000,
    voiceover:
      "Evet, kesinlikle bu Silikon Vadisi'nin en büyük dolandırıcılıklarından biri. Beni izlemeye devam et!",
  },
];

const DEMO_DURATION_SEC = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DijiPresenter"
        component={DijiPresenter}
        durationInFrames={DEMO_DURATION_SEC * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: DEMO_SCENES,
          totalDurationSec: DEMO_DURATION_SEC,
          title: "Theranos",
          subtitle: "9 Milyar Dolarlık Yalan",
          audioSrc: undefined,
        }}
      />
    </>
  );
};

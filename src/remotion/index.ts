import { registerRoot, Composition } from "remotion";
import {
  DupeReel,
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
} from "./DupeReel";
import type { ReelScript } from "@/lib/dupe-types";

// Placeholder script — real props are passed at render time via inputProps.
const placeholder: ReelScript = {
  pairs: [],
  segments: [
    { key: "hook", text: "", audioDataUrl: "", durationSec: 2 },
    { key: "reveal_1", text: "", audioDataUrl: "", durationSec: 2 },
    { key: "reveal_2", text: "", audioDataUrl: "", durationSec: 2 },
    { key: "reveal_3", text: "", audioDataUrl: "", durationSec: 2 },
    { key: "reveal_4", text: "", audioDataUrl: "", durationSec: 2 },
    { key: "cta", text: "", audioDataUrl: "", durationSec: 2 },
  ],
};

const RemotionRoot = () => (
  <Composition
    id="DupeReel"
    component={DupeReel}
    durationInFrames={totalDurationInFrames(placeholder)}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{ script: placeholder }}
    calculateMetadata={({ props }) => ({
      durationInFrames: totalDurationInFrames(props.script),
    })}
  />
);

registerRoot(RemotionRoot);

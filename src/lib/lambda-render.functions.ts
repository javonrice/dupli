import { createServerFn } from "@tanstack/react-start";
import type { ReelScript } from "@/lib/dupe-types";

const REGION = "us-east-2";

const FPS = 30;
const TAIL_FRAMES = 60;
const TRANSITION_FRAMES = 14;
const SCAN_INTRO_FRAMES = 45;

function estimateTotalFrames(script: ReelScript): number {
  const frames = script.segments.reduce((sum, segment) => {
    const base = Math.max(75, Math.round(segment.durationSec * FPS) + TAIL_FRAMES);
    const scanIntro = segment.key.startsWith("reveal_") ? SCAN_INTRO_FRAMES : 0;
    return sum + base + scanIntro;
  }, 0);

  return Math.max(1, frames - TRANSITION_FRAMES * Math.max(0, script.segments.length - 1));
}

export const startLambdaRender = createServerFn({ method: "POST" })
  .inputValidator((data: { script: ReelScript }) => data)
  .handler(async ({ data }) => {
    const { renderMediaOnLambda } = await import("@remotion/lambda-client");
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    const serveUrl = process.env.REMOTION_SERVE_URL;
    if (!functionName || !serveUrl) {
      throw new Error("Lambda env vars not configured");
    }
    const totalFrames = estimateTotalFrames(data.script);
    // Keep renderer concurrency tiny for low-quota AWS accounts:
    // renderer Lambdas = ceil(totalFrames / framesPerLambda), plus 1 orchestrator.
    const framesPerLambda = Math.max(1000, Math.ceil(totalFrames / 2));

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: REGION as "us-east-2",
      functionName,
      serveUrl,
      composition: "DupeReel",
      inputProps: { script: data.script },
      codec: "h264",
      imageFormat: "jpeg",
      jpegQuality: 90,
      privacy: "public",
      maxRetries: 1,
      framesPerLambda,
      concurrencyPerLambda: 1,
    });
    return { renderId, bucketName };
  });

export const getLambdaRenderProgress = createServerFn({ method: "POST" })
  .inputValidator((data: { renderId: string; bucketName: string }) => data)
  .handler(async ({ data }) => {
    const { getRenderProgress } = await import("@remotion/lambda-client");
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    if (!functionName) throw new Error("Lambda env vars not configured");

    // Retry on AWS throttling with exponential backoff + jitter
    let lastErr: unknown;
    let delay = 800;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const progress = await getRenderProgress({
          renderId: data.renderId,
          bucketName: data.bucketName,
          functionName,
          region: REGION as "us-east-2",
        });
        return {
          done: progress.done,
          overallProgress: progress.overallProgress,
          outputFile: progress.outputFile ?? null,
          errors: progress.errors?.map((e) => e.message) ?? [],
          fatalErrorEncountered: progress.fatalErrorEncountered,
        };
      } catch (e) {
        lastErr = e;
        const name = e instanceof Error ? e.name : "";
        const msg = e instanceof Error ? e.message : String(e);
        const throttled =
          name === "TooManyRequestsException" ||
          /rate exceeded|throttl/i.test(msg);
        if (!throttled) throw e;
        const jitter = Math.random() * delay * 0.5;
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay *= 2;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Throttled");
  });


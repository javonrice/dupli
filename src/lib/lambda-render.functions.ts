import { createServerFn } from "@tanstack/react-start";
import type { ReelScript } from "@/lib/dupe-types";

const REGION = "us-east-2";
const REMOTION_VERSION = "4.0.468";

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

function getEnv() {
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SERVE_URL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.REMOTION_AWS_REGION || REGION;
  if (!functionName || !serveUrl || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `Lambda env not configured (fn=${!!functionName}, serveUrl=${!!serveUrl}, key=${!!accessKeyId}, secret=${!!secretAccessKey})`,
    );
  }
  return { functionName, serveUrl, accessKeyId, secretAccessKey, region };
}

async function invokeLambda<T>(
  functionName: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  payload: unknown,
): Promise<T> {
  const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
  const client = new LambdaClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const res = await client.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
      InvocationType: "RequestResponse",
    }),
  );
  if (res.FunctionError) {
    const body = res.Payload ? new TextDecoder().decode(res.Payload) : "";
    throw new Error(`Lambda error: ${res.FunctionError} ${body}`);
  }
  if (!res.Payload) {
    throw new Error(`Lambda returned no payload (status ${res.StatusCode})`);
  }
  const decoded = new TextDecoder("utf-8").decode(res.Payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(`Invalid Lambda JSON: ${decoded.slice(0, 500)}`);
  }
  if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "error") {
    const e = parsed as { message?: string; stack?: string };
    throw new Error(`Remotion render error: ${e.message ?? "unknown"}`);
  }
  return parsed as T;
}

function buildStartPayload(serveUrl: string, script: ReelScript, totalFrames: number) {
  const framesPerLambda = Math.max(1000, Math.ceil(totalFrames / 2));
  const stringifiedInputProps = JSON.stringify({ script });
  return {
    type: "start",
    serveUrl,
    composition: "DupeReel",
    inputProps: { type: "payload", payload: stringifiedInputProps },
    codec: "h264",
    imageFormat: "jpeg",
    crf: null,
    envVariables: {},
    pixelFormat: null,
    proResProfile: null,
    x264Preset: null,
    gopSize: null,
    jpegQuality: 90,
    maxRetries: 1,
    privacy: "public",
    logLevel: "info",
    frameRange: null,
    outName: null,
    timeoutInMilliseconds: 30000,
    chromiumOptions: {},
    scale: 1,
    everyNthFrame: 1,
    numberOfGifLoops: null,
    concurrencyPerLambda: 1,
    downloadBehavior: { type: "play-in-browser" },
    muted: false,
    version: REMOTION_VERSION,
    overwrite: false,
    audioBitrate: null,
    videoBitrate: null,
    encodingBufferSize: null,
    encodingMaxRate: null,
    webhook: null,
    forceHeight: null,
    forceWidth: null,
    forceFps: null,
    forceDurationInFrames: null,
    bucketName: null,
    audioCodec: null,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: null,
    colorSpace: null,
    preferLossless: false,
    forcePathStyle: false,
    metadata: null,
    licenseKey: null,
    offthreadVideoThreads: null,
    mediaCacheSizeInBytes: null,
    storageClass: null,
    isProduction: true,
    sampleRate: 48000,
    rendererFunctionName: null,
    framesPerLambda,
    concurrency: null,
  };
}

function buildStatusPayload(renderId: string, bucketName: string) {
  return {
    type: "status",
    bucketName,
    renderId,
    version: REMOTION_VERSION,
    s3OutputProvider: null,
    logLevel: "info",
    forcePathStyle: false,
  };
}

export const startLambdaRender = createServerFn({ method: "POST" })
  .inputValidator((data: { script: ReelScript }) => data)
  .handler(async ({ data }) => {
    const env = getEnv();
    const totalFrames = estimateTotalFrames(data.script);
    const payload = buildStartPayload(env.serveUrl, data.script, totalFrames);
    const res = await invokeLambda<{ renderId: string; bucketName: string }>(
      env.functionName,
      env.region,
      env.accessKeyId,
      env.secretAccessKey,
      payload,
    );
    if (!res?.renderId || !res?.bucketName) {
      throw new Error(`Render start missing renderId/bucketName: ${JSON.stringify(res)}`);
    }
    return { renderId: res.renderId, bucketName: res.bucketName };
  });

export const getLambdaRenderProgress = createServerFn({ method: "POST" })
  .inputValidator((data: { renderId: string; bucketName: string }) => data)
  .handler(async ({ data }) => {
    const env = getEnv();
    const payload = buildStatusPayload(data.renderId, data.bucketName);

    let lastErr: unknown;
    let delay = 800;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const progress = await invokeLambda<{
          done: boolean;
          overallProgress: number;
          outputFile: string | null;
          errors?: Array<{ message: string }>;
          fatalErrorEncountered: boolean;
        }>(env.functionName, env.region, env.accessKeyId, env.secretAccessKey, payload);
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
          name === "TooManyRequestsException" || /rate exceeded|throttl/i.test(msg);
        if (!throttled) throw e;
        const jitter = Math.random() * delay * 0.5;
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay *= 2;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Throttled");
  });

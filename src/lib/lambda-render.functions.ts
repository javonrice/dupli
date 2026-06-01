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
  const bucketName = process.env.REMOTION_LAMBDA_BUCKET ?? null;
  if (!functionName || !serveUrl || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `Lambda env not configured (fn=${!!functionName}, serveUrl=${!!serveUrl}, key=${!!accessKeyId}, secret=${!!secretAccessKey})`,
    );
  }
  return { functionName, serveUrl, accessKeyId, secretAccessKey, region, bucketName };
}

// AWS Signature V4 using Web Crypto — works in Cloudflare Workers (no Node.js SDK needed).
async function hmacSha256(key: BufferSource | CryptoKey, data: string): Promise<ArrayBuffer> {
  const cryptoKey =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signedLambdaRequest(
  functionName: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  body: string,
  invocationType: "RequestResponse" | "Event" = "RequestResponse",
): Promise<Response> {
  const host = `lambda.${region}.amazonaws.com`;
  const url = `https://${host}/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-invocation-type:${invocationType}\n`;

  const signedHeaders = "content-type;host;x-amz-date;x-amz-invocation-type";

  const canonicalRequest = [
    "POST",
    `/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/lambda/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "lambda");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": host,
      "X-Amz-Date": amzDate,
      "X-Amz-Invocation-Type": invocationType,
      "Authorization": authHeader,
    },
    body,
  });
}

// Fire-and-forget: dispatches to Lambda asynchronously, returns 202 immediately.
async function fireLambdaAsync(
  functionName: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify(payload);
  const res = await signedLambdaRequest(functionName, region, accessKeyId, secretAccessKey, body, "Event");
  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    throw new Error(`Lambda async dispatch failed HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
}

// Synchronous invoke: waits for Lambda to return (use only for fast calls like status checks).
async function invokeLambda<T>(
  functionName: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  payload: unknown,
): Promise<T> {
  const body = JSON.stringify(payload);
  const res = await signedLambdaRequest(functionName, region, accessKeyId, secretAccessKey, body, "RequestResponse");

  const functionError = res.headers.get("X-Amz-Function-Error");
  const decoded = await res.text();

  if (functionError) {
    throw new Error(`Lambda error: ${functionError} ${decoded.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`Lambda HTTP ${res.status}: ${decoded.slice(0, 500)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(`Invalid Lambda JSON: ${decoded.slice(0, 500)}`);
  }
  if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "error") {
    const e = parsed as { message?: string };
    throw new Error(`Remotion render error: ${e.message ?? "unknown"}`);
  }
  return parsed as T;
}

function buildStartPayload(
  serveUrl: string,
  script: ReelScript,
  totalFrames: number,
  renderId: string,
  bucketName: string | null,
) {
  const framesPerLambda = Math.max(1000, Math.ceil(totalFrames / 2));
  const stringifiedInputProps = JSON.stringify({ script });
  return {
    type: "start",
    renderId,
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
    bucketName,
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
    // Pre-generate renderId so we can return it immediately without waiting
    // for Lambda to finish (avoids Cloudflare's 30s gateway timeout).
    const renderId = crypto.randomUUID();
    const payload = buildStartPayload(env.serveUrl, data.script, totalFrames, renderId, env.bucketName);
    // Fire-and-forget: Lambda accepts the job and returns 202 in ~100ms.
    await fireLambdaAsync(
      env.functionName,
      env.region,
      env.accessKeyId,
      env.secretAccessKey,
      payload,
    );
    if (!env.bucketName) {
      throw new Error("REMOTION_LAMBDA_BUCKET env var is required for async rendering");
    }
    return { renderId, bucketName: env.bucketName };
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

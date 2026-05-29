import { createServerFn } from "@tanstack/react-start";
import type { ReelScript } from "@/lib/dupe-types";

const REGION = "us-east-2";

export const startLambdaRender = createServerFn({ method: "POST" })
  .inputValidator((data: { script: ReelScript }) => data)
  .handler(async ({ data }) => {
    const { renderMediaOnLambda } = await import("@remotion/lambda-client");
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    const serveUrl = process.env.REMOTION_SERVE_URL;
    if (!functionName || !serveUrl) {
      throw new Error("Lambda env vars not configured");
    }
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
      framesPerLambda: 30,
    });
    return { renderId, bucketName };
  });

export const getLambdaRenderProgress = createServerFn({ method: "POST" })
  .inputValidator((data: { renderId: string; bucketName: string }) => data)
  .handler(async ({ data }) => {
    const { getRenderProgress } = await import("@remotion/lambda-client");
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    if (!functionName) throw new Error("Lambda env vars not configured");
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
  });

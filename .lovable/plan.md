## What is actually failing

The current failure is not the video itself and not `REMOTION_SERVE_URL` being missing. Server logs show:

```text
functionNameSet: true
serveUrlSet: true
hasAccessKey: true
hasSecret: true
region: us-east-2
import failed TypeError [ERR_INVALID_ARG_VALUE] ... path ... Received 'undefined'
```

So the app has the Remotion Lambda settings, but the server runtime crashes while importing `@remotion/lambda-client`. That package pulls in Node/AWS SDK filesystem credential-loading code during module initialization, which is incompatible with the app’s Worker-style server runtime. Because import fails, rendering never starts and no downloadable MP4 can exist.

## Implementation plan

1. **Stop importing `@remotion/lambda-client` inside the app server function**
   - Remove the dynamic imports from `src/lib/lambda-render.functions.ts`.
   - Keep the existing validated inputs, frame estimation, throttling choices, and UI polling contract.

2. **Create a Worker-safe Lambda invocation helper**
   - Add a small server-only helper that uses the already-installed AWS SDK Lambda client (`@aws-sdk/client-lambda`) to invoke the deployed Remotion Lambda directly.
   - This avoids Remotion’s client package import path while still calling the same deployed renderer.
   - The helper will build the Remotion payload with explicit values: `type: "start"`, `composition: "DupeReel"`, `serveUrl`, `inputProps`, `codec`, `framesPerLambda`, `concurrencyPerLambda`, etc.

3. **Handle progress without importing Remotion client**
   - Use the same Lambda invocation approach for `type: "status"` polling.
   - Normalize the response into the existing UI shape: `done`, `overallProgress`, `outputFile`, `errors`, `fatalErrorEncountered`.

4. **Make failures visible instead of silent**
   - Add precise error messages for: missing AWS credentials, Lambda invoke errors, invalid Lambda JSON response, missing render ID, and render fatal errors.
   - Keep logs focused so the next error, if any, points to the exact stage.

5. **Verify end-to-end**
   - Invoke the server render path from the running app/server tools.
   - Check server logs for successful render start (`renderId` + `bucketName`).
   - Poll progress until the output URL is returned.
   - Confirm `/api/download-video` can stream the returned MP4 URL as an attachment.

## Files expected to change

- `src/lib/lambda-render.functions.ts`
- Potentially one new helper under `src/lib/` for the AWS Lambda invoke wrapper

## Why this is the right fix

Changing environment variables will not solve this specific error because the logs prove they are present. The blocker is importing a Node-oriented Remotion client package inside the app’s server runtime. Bypassing that import and calling the deployed Lambda over AWS’s API removes the incompatible path and lets the render/download flow continue.
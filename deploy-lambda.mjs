import { deployFunction, deploySite, getOrCreateBucket } from '@remotion/lambda';
import path from 'path';

const region = process.env.REMOTION_AWS_REGION;
if (!region) throw new Error('REMOTION_AWS_REGION missing');

console.log('Region:', region);
console.log('Bucket env:', process.env.REMOTION_AWS_S3_BUCKET);

console.log('\n1/3 Ensuring Remotion bucket...');
const { bucketName } = await getOrCreateBucket({ region });
console.log('Bucket:', bucketName);

console.log('\n2/3 Deploying Lambda function (this takes ~2-3 min)...');
const fn = await deployFunction({
  region,
  timeoutInSeconds: 240,
  memorySizeInMb: 3008,
  diskSizeInMb: 10240,
  createCloudWatchLogGroup: true,
});
console.log('Function name:', fn.functionName);
console.log('Already existed:', fn.alreadyExisted);

console.log('\n3/3 Bundling + deploying site (DupeReel composition)...');
const site = await deploySite({
  bucketName,
  entryPoint: path.resolve('src/remotion/index.tsx'),
  siteName: 'dupli-reel',
  region,
  options: { onBundleProgress: (p) => process.stdout.write(`\r  bundle ${p}%`) },
});
console.log('\nServe URL:', site.serveUrl);

console.log('\n=== DONE ===');
console.log('REMOTION_LAMBDA_FUNCTION_NAME=' + fn.functionName);
console.log('REMOTION_SERVE_URL=' + site.serveUrl);
console.log('REMOTION_LAMBDA_BUCKET=' + bucketName);

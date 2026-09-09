import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const region = process.env.MINIO_REGION || 'us-east-1';
const accessKeyId = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretAccessKey = process.env.MINIO_SECRET_KEY || 'minioadmin';

export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'culibspace-avatars';
export const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_URL || endpoint;

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Required for MinIO
});

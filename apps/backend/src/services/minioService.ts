import {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import path from 'path';
import { s3Client, MINIO_BUCKET, MINIO_PUBLIC_URL } from '../utils/s3Client.js';

let isBucketReady = false;

export class MinioService {
  /**
   * Ensure the MinIO bucket exists and has a public read policy configured.
   */
  static async ensureBucketExists(): Promise<void> {
    if (isBucketReady) return;

    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      }
    }

    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
          },
        ],
      };
      await s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: MINIO_BUCKET,
          Policy: JSON.stringify(policy),
        })
      );
    } catch {
      // Ignore if policy is already set
    }

    isBucketReady = true;
  }

  /**
   * Upload an avatar file buffer to the MinIO bucket and return its public URL.
   */
  static async uploadAvatar(file: Express.Multer.File, uid: number): Promise<string> {
    await MinioService.ensureBucketExists();

    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const key = `avatars/avatar-${uid}-${Date.now()}-${randomSuffix}${ext}`;

    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    // Return the publicly accessible direct URL
    const baseUrl = MINIO_PUBLIC_URL.replace(/\/+$/, '');
    return `${baseUrl}/${MINIO_BUCKET}/${key}`;
  }

  /**
   * Delete an existing avatar from the MinIO bucket if it was hosted there.
   */
  static async deleteAvatar(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl || !imageUrl.includes(`/${MINIO_BUCKET}/`)) {
        return;
      }

      const bucketPrefix = `/${MINIO_BUCKET}/`;
      const keyIndex = imageUrl.indexOf(bucketPrefix);
      if (keyIndex === -1) return;

      const key = imageUrl.substring(keyIndex + bucketPrefix.length);
      if (!key) return;

      const command = new DeleteObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
      });

      await s3Client.send(command);
    } catch (err) {
      console.warn('[MinioService] Failed to delete previous avatar from MinIO:', err);
    }
  }
}

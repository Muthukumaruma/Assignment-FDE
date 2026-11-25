import { DeleteObjectsCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FileStore } from '../types.js';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Cloudflare R2 through its S3-compatible API. The bucket stays private: files are only
 * ever served through the API, after the ownership check in the documents route.
 */
export function createR2FileStore(cfg: R2Config): FileStore {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  return {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        if (!res.Body) return null;
        return { body: await res.Body.transformToByteArray(), contentType: res.ContentType ?? 'application/octet-stream' };
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async delete(keys) {
      if (keys.length === 0) return;
      await s3.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
  };
}

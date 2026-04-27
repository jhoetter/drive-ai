import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";

export interface S3BlobConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export function createS3BlobStore(config: S3BlobConfig) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });

  return {
    async putObject(key: string, body: Buffer, contentType: string) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { key, size: body.length, sha256: sha256Hex(body) };
    },
    async getObjectBytes(key: string): Promise<Buffer> {
      const r = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (!r.Body) throw new Error("empty body");
      return Buffer.from(await r.Body.transformToByteArray());
    },
    async deleteObject(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    async presignPut(
      key: string,
      contentType: string,
      expiresInSeconds = 3600,
    ): Promise<string> {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      );
    },
    async presignGet(key: string, expiresInSeconds = 3600) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type BlobStore = ReturnType<typeof createS3BlobStore>;

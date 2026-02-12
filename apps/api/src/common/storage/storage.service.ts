import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  private logger = new Logger(StorageService.name);

  private resolveStorageEndpoint(
    rawEndpoint: string | undefined,
    minioPort: string,
    useSsl: boolean,
  ): string {
    const protocol = useSsl ? 'https' : 'http';
    const fallback = `${protocol}://localhost:${minioPort}`;
    const trimmed = rawEndpoint?.trim();

    if (!trimmed) {
      return fallback;
    }

    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `${protocol}://${trimmed}`;

    try {
      const parsed = new URL(withProtocol);
      if (!parsed.port) {
        parsed.port = minioPort;
      }
      // Keep path support for deployments that expose storage behind a URL prefix.
      return parsed.toString().replace(/\/$/, '');
    } catch {
      this.logger.warn(
        `Invalid storage endpoint "${trimmed}", using fallback ${fallback}`,
      );
      return fallback;
    }
  }

  constructor(private configService: ConfigService) {
    const minioEndpoint = this.configService.get<string>('MINIO_ENDPOINT');
    const minioPort = this.configService.get<string>('MINIO_PORT', '9000');
    const minioUseSsl = this.configService.get<string>(
      'MINIO_USE_SSL',
      'false',
    );
    const minioAccessKey = this.configService.get<string>('MINIO_ACCESS_KEY');
    const minioSecretKey = this.configService.get<string>('MINIO_SECRET_KEY');
    const minioBucket = this.configService.get<string>('MINIO_BUCKET_NAME');

    const endpoint = this.resolveStorageEndpoint(
      this.configService.get<string>('STORAGE_ENDPOINT') || minioEndpoint,
      minioPort,
      minioUseSsl === 'true',
    );
    const region = this.configService.get('STORAGE_REGION', 'us-east-1');
    const accessKeyId =
      this.configService.get('STORAGE_ACCESS_KEY') ||
      minioAccessKey ||
      'minioadmin';
    const secretAccessKey =
      this.configService.get('STORAGE_SECRET_KEY') ||
      minioSecretKey ||
      'minioadmin';
    this.bucket =
      this.configService.get('STORAGE_BUCKET') || minioBucket || 'uploads';

    this.s3Client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true, // Required for MinIO
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiry = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiry });
  }

  async getPresignedGetUrl(key: string, expiry = 3600): Promise<string> {
    return this.getPresignedGetUrlWithDisposition(key, undefined, expiry);
  }

  async getPresignedGetUrlWithDisposition(
    key: string,
    responseContentDisposition?: string,
    expiry = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiry });
  }

  async headObject(key: string): Promise<boolean> {
    try {
      await this.getHeadObject(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getHeadObject(key: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await this.s3Client.send(command);
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3Client.send(command);
  }

  async computeSha256(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const result = await this.s3Client.send(command);
    const body = result.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body || !(Symbol.asyncIterator in body)) {
      throw new Error('Storage object body is not readable');
    }

    const hash = createHash('sha256');
    for await (const chunk of body) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }
}

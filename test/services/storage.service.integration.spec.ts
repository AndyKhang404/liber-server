import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from '../../src/storage/storage.service.js';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { InternalServerErrorException } from '@nestjs/common';

describe('StorageService Integration', () => {
  let service: StorageService;
  let mockS3Client: { send: any };

  beforeEach(async () => {
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'minio_test_user';
    process.env.S3_SECRET_KEY = 'minio_test_password';
    process.env.S3_BUCKET = 'integration-test-bucket';
    process.env.S3_REGION = 'us-east-1';

    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);

    // Provide mock storage backend for S3Client.send
    const storageStore = new Map<string, { body: Buffer; contentType: string }>();

    mockS3Client = {
      send: vi.fn(async (command: any) => {
        if (command instanceof HeadBucketCommand) {
          return {};
        }
        if (command instanceof CreateBucketCommand) {
          return {};
        }
        if (command instanceof PutObjectCommand) {
          const { Key, Body, ContentType } = command.input as any;
          storageStore.set(Key, { body: Buffer.from(Body), contentType: ContentType });
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const { Key } = command.input as any;
          const found = storageStore.get(Key);
          if (!found) {
            const err = new Error('NoSuchKey');
            (err as any).name = 'NoSuchKey';
            throw err;
          }
          const stream = new Readable();
          stream.push(found.body);
          stream.push(null);
          return {
            Body: stream,
            ContentType: found.contentType,
          };
        }
        if (command instanceof DeleteObjectCommand) {
          const { Key } = command.input as any;
          storageStore.delete(Key);
          return {};
        }
        throw new Error('Unsupported command in test');
      }),
    };

    (service as any).client = mockS3Client;
  });

  describe('Storage Lifecycle Integration', () => {
    it('should initialize bucket, upload payload, read stream, and delete payload', async () => {
      // 1. Initialize
      await service.onModuleInit();
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));

      // 2. Upload
      const testKey = 'books/users/user-123/file-abc.pdf';
      const fileContent = Buffer.from('Binary PDF stream test content \x00\x01\x02');
      const contentType = 'application/pdf';

      await service.upload(testKey, fileContent, contentType);
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));

      // 3. Download and read back stream
      const { stream, contentType: returnedType } = await service.download(testKey);
      expect(returnedType).toBe(contentType);

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const retrievedBuffer = Buffer.concat(chunks);
      expect(retrievedBuffer.equals(fileContent)).toBe(true);

      // 4. Delete
      await service.delete(testKey);
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));

      // 5. Subsequent download throws InternalServerErrorException
      await expect(service.download(testKey)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should handle bucket initialization when bucket does not yet exist', async () => {
      let bucketCreated = false;
      mockS3Client.send = vi.fn(async (command: any) => {
        if (command instanceof HeadBucketCommand) {
          if (!bucketCreated) {
            throw new Error('Bucket does not exist');
          }
          return {};
        }
        if (command instanceof CreateBucketCommand) {
          bucketCreated = true;
          return {};
        }
        return {};
      });

      await service.onModuleInit();

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(CreateBucketCommand));
      expect(bucketCreated).toBe(true);
    });
  });
});

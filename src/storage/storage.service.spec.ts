import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service.js';
import { InternalServerErrorException } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

describe('StorageService', () => {
  let service: StorageService;
  let s3SendSpy: ReturnType<typeof vi.spyOn>;

  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'test_access_key';
    process.env.S3_SECRET_KEY = 'test_secret_key';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';

    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
    s3SendSpy = vi.spyOn((service as any).client, 'send');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should throw if S3_ENDPOINT is missing', () => {
      delete process.env.S3_ENDPOINT;
      expect(() => new StorageService()).toThrow(
        'S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be defined',
      );
    });

    it('should throw if S3_ACCESS_KEY is missing', () => {
      delete process.env.S3_ACCESS_KEY;
      expect(() => new StorageService()).toThrow(
        'S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be defined',
      );
    });

    it('should throw if S3_SECRET_KEY is missing', () => {
      delete process.env.S3_SECRET_KEY;
      expect(() => new StorageService()).toThrow(
        'S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be defined',
      );
    });

    it('should use default bucket if S3_BUCKET is not set', () => {
      delete process.env.S3_BUCKET;
      const defaultService = new StorageService();
      expect((defaultService as any).bucket).toBe('liber-books');
    });
  });

  describe('onModuleInit', () => {
    it('should check if bucket exists and not create it if HeadBucket succeeds', async () => {
      s3SendSpy.mockResolvedValueOnce({} as never);

      await service.onModuleInit();

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      expect(s3SendSpy.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect((s3SendSpy.mock.calls[0][0] as any).input).toEqual({
        Bucket: 'test-bucket',
      });
    });

    it('should create bucket if HeadBucket throws', async () => {
      s3SendSpy
        .mockRejectedValueOnce(new Error('Bucket does not exist'))
        .mockResolvedValueOnce({} as never);

      await service.onModuleInit();

      expect(s3SendSpy).toHaveBeenCalledTimes(2);
      expect(s3SendSpy.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(s3SendSpy.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect((s3SendSpy.mock.calls[1][0] as any).input).toEqual({
        Bucket: 'test-bucket',
      });
    });
  });

  describe('upload', () => {
    it('should upload file successfully', async () => {
      s3SendSpy.mockResolvedValueOnce({} as never);
      const buffer = Buffer.from('test content');

      await service.upload('books/1/doc.pdf', buffer, 'application/pdf');

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      expect(s3SendSpy.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect((s3SendSpy.mock.calls[0][0] as any).input).toEqual({
        Bucket: 'test-bucket',
        Key: 'books/1/doc.pdf',
        Body: buffer,
        ContentType: 'application/pdf',
      });
    });

    it('should throw InternalServerErrorException if upload fails', async () => {
      s3SendSpy.mockRejectedValueOnce(new Error('S3 error'));

      await expect(
        service.upload('key', Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow(
        new InternalServerErrorException('Failed to upload file'),
      );
    });
  });

  describe('download', () => {
    it('should download file stream and content type successfully', async () => {
      const mockStream = new Readable();
      mockStream.push('file-content');
      mockStream.push(null);

      s3SendSpy.mockResolvedValueOnce({
        Body: mockStream,
        ContentType: 'application/pdf',
      } as never);

      const result = await service.download('books/1/doc.pdf');

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      expect(s3SendSpy.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
      expect((s3SendSpy.mock.calls[0][0] as any).input).toEqual({
        Bucket: 'test-bucket',
        Key: 'books/1/doc.pdf',
      });
      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('application/pdf');
    });

    it('should throw InternalServerErrorException if download fails', async () => {
      s3SendSpy.mockRejectedValueOnce(new Error('S3 error'));

      await expect(service.download('nonexistent')).rejects.toThrow(
        new InternalServerErrorException('Failed to download file'),
      );
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      s3SendSpy.mockResolvedValueOnce({} as never);

      await service.delete('books/1/doc.pdf');

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      expect(s3SendSpy.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
      expect((s3SendSpy.mock.calls[0][0] as any).input).toEqual({
        Bucket: 'test-bucket',
        Key: 'books/1/doc.pdf',
      });
    });

    it('should throw InternalServerErrorException if delete fails', async () => {
      s3SendSpy.mockRejectedValueOnce(new Error('S3 error'));

      await expect(service.delete('books/1/doc.pdf')).rejects.toThrow(
        new InternalServerErrorException('Failed to delete file'),
      );
    });
  });
});

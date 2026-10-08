import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Readable } from 'stream';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { DbModule } from '../../src/db/db.module.js';
import { DbService } from '../../src/db/db.service.js';
import { StorageModule } from '../../src/storage/storage.module.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { createMockDb } from './mock-db.js';
import { startTestEnvironment, cleanDatabase } from './testcontainers-environment.js';

export interface E2eContext {
  app: INestApplication;
  cleanDb: () => Promise<void>;
  close: () => Promise<void>;
  isLite: boolean;
}

export async function createE2eContext(): Promise<E2eContext> {
  const isLite = process.env.E2E_MODE !== 'testcontainers';

  if (!isLite) {
    // Heavy mode: real PostgreSQL 18 & S3 containers
    await startTestEnvironment();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    return {
      app,
      cleanDb: async () => {
        await cleanDatabase();
      },
      close: async () => {
        await app.close();
      },
      isLite: false,
    };
  } else {
    // Lite mode: fast in-memory database and storage mocks
    const mockDbInstance = createMockDb();
    const storageMap = new Map<string, { buffer: Buffer; contentType: string }>();

    const mockStorageService = {
      onModuleInit: vi.fn(),
      upload: vi.fn(async (key: string, buffer: Buffer, contentType: string) => {
        storageMap.set(key, { buffer, contentType });
      }),
      download: vi.fn(async (key: string) => {
        const item = storageMap.get(key);
        if (!item) {
          throw new Error('Object not found in storage');
        }
        const stream = new Readable();
        stream.push(item.buffer);
        stream.push(null);
        return { stream, contentType: item.contentType };
      }),
      delete: vi.fn(async (key: string) => {
        storageMap.delete(key);
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(DbModule)
      .useModule({
        module: class MockDbModule {},
        providers: [
          {
            provide: DbService,
            useValue: { db: mockDbInstance.db },
          },
        ],
        exports: [DbService],
      })
      .overrideModule(StorageModule)
      .useModule({
        module: class MockStorageModule {},
        providers: [
          {
            provide: StorageService,
            useValue: mockStorageService,
          },
        ],
        exports: [StorageService],
      })
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    return {
      app,
      cleanDb: async () => {
        mockDbInstance.reset();
        storageMap.clear();
      },
      close: async () => {
        await app.close();
      },
      isLite: true,
    };
  }
}

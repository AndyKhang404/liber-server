import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from './db.service.js';

describe('DbService', () => {
  let service: DbService;
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(async () => {
    process.env.DATABASE_URL =
      'postgres://test_user:test_password@localhost:5432/test_db';

    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.db).toBeDefined();
  });

  it('should throw an error if DATABASE_URL is not defined', () => {
    delete process.env.DATABASE_URL;
    expect(() => new DbService()).toThrow('DATABASE_URL is not defined');
  });

  it('should call pool.end() on module destroy', async () => {
    const endSpy = vi.spyOn((service as any).pool, 'end').mockResolvedValue(undefined as never);
    await service.onModuleDestroy();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DbModule } from '../src/db/db.module.js';
import { DbService } from '../src/db/db.service.js';
import { StorageModule } from '../src/storage/storage.module.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createMockDb } from './helpers/mock-db.js';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let mockDbInstance: ReturnType<typeof createMockDb>;

  beforeAll(async () => {
    mockDbInstance = createMockDb();

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
            useValue: {
              onModuleInit: vi.fn(),
              upload: vi.fn(),
              download: vi.fn(),
              delete: vi.fn(),
            },
          },
        ],
        exports: [StorageService],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDbInstance.reset();
  });

  describe('POST /auth/signup', () => {
    it('should register a new user successfully with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          username: 'charlie',
          email: 'charlie@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(response.body).toEqual({});
      expect(mockDbInstance.getState().users.length).toBe(1);
      expect(mockDbInstance.getState().users[0].username).toBe('charlie');
    });

    it('should return 409 Conflict if username already exists', async () => {
      // First signup
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          username: 'charlie',
          email: 'charlie@example.com',
          password: 'Password123!',
        })
        .expect(200);

      // Duplicate signup
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          username: 'charlie',
          email: 'different@example.com',
          password: 'AnotherPassword123!',
        })
        .expect(409);

      expect(res.body.message).toBe('Username has been taken');
    });

    it('should return 400 Bad Request for invalid input payload', async () => {
      // Username too short, email invalid, password too short
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          username: 'ab',
          email: 'invalid-email-format',
          password: '123',
        })
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Seed a user for login tests
      await request(app.getHttpServer()).post('/auth/signup').send({
        username: 'alice_login',
        email: 'alice@example.com',
        password: 'ValidPassword123!',
      });
    });

    it('should authenticate user and return access_token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'alice_login',
          password: 'ValidPassword123!',
        })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(typeof res.body.access_token).toBe('string');
    });

    it('should return 401 Unauthorized for incorrect password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'alice_login',
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(res.body.message).toBe('Wrong username or password');
    });

    it('should return 401 Unauthorized for non-existent user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'nonexistent_user',
          password: 'ValidPassword123!',
        })
        .expect(401);

      expect(res.body.message).toBe('Wrong username or password');
    });

    it('should return 400 Bad Request when missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('GET /auth/profile', () => {
    it('should return 401 Unauthorized when no Authorization header is provided', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('should return 401 Unauthorized with invalid Bearer token', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);
    });

    it('should return profile claims when valid Bearer token is provided', async () => {
      // 1. Signup
      await request(app.getHttpServer()).post('/auth/signup').send({
        username: 'profile_user',
        email: 'profile@example.com',
        password: 'Password123!',
      });

      // 2. Login to get token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: 'profile_user',
          password: 'Password123!',
        });

      const token = loginRes.body.access_token;

      // 3. Request profile with token
      const profileRes = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body.username).toBe('profile_user');
      expect(profileRes.body.sub).toBeDefined();
      expect(profileRes.body.iss).toBe('urn:liber-server:issuer');
      expect(profileRes.body.aud).toBe('urn:liber-server:audience');
    });
  });
});

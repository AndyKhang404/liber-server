import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service.js';
import { DbService } from '../../src/db/db.service.js';
import { createMockDb } from '../helpers/mock-db.js';

describe('UsersService Integration', () => {
  let usersService: UsersService;
  let mockDbInstance: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDbInstance = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DbService,
          useValue: { db: mockDbInstance.db },
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  describe('Database Operations Integration', () => {
    it('should insert a user into the database and retrieve them by username', async () => {
      const userInfo = {
        username: 'marcus_aurelius',
        email: 'marcus@stoic.org',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehashvalue',
      };

      const added = await usersService.addOne(userInfo);
      expect(added).toBeDefined();
      expect(added.username).toBe(userInfo.username);
      expect(added.email).toBe(userInfo.email);
      expect(added.userId).toBeDefined();

      const found = await usersService.findOne(userInfo.username);
      expect(found).toBeDefined();
      expect(found?.username).toBe(userInfo.username);
      expect(found?.email).toBe(userInfo.email);
      expect(found?.passwordHash).toBe(userInfo.passwordHash);
      expect(found?.userId).toBe(added.userId);
    });

    it('should return undefined when searching for a nonexistent username', async () => {
      const found = await usersService.findOne('does_not_exist');
      expect(found).toBeUndefined();
    });

    it('should return debug user when username is "khang" without accessing DB', async () => {
      const found = await usersService.findOne('khang');
      expect(found).toBeDefined();
      expect(found?.userId).toBe('1');
      expect(found?.username).toBe('khang');
      expect(found?.email).toBe('andykhang404@gmail.com');
      // DB remains empty
      expect(mockDbInstance.getState().users.length).toBe(0);
    });
  });
});

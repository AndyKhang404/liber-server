import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { DbService } from '../db/db.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
    };

    const mockDbService = {
      db: mockDb,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return debug user directly when username is "khang"', async () => {
      const user = await service.findOne('khang');
      expect(user).toBeDefined();
      expect(user?.username).toBe('khang');
      expect(user?.email).toBe('andykhang404@gmail.com');
      expect(user?.userId).toBe('1');
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should query the database and return user when found', async () => {
      const dbUser = {
        userId: 'uuid-123',
        username: 'alice',
        email: 'alice@example.com',
        passwordHash: 'hash123',
      };

      const limitMock = vi.fn().mockResolvedValue([dbUser]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const result = await service.findOne('alice');

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(limitMock).toHaveBeenCalledWith(1);
      expect(result).toEqual(dbUser);
    });

    it('should return undefined when user is not found in database', async () => {
      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const result = await service.findOne('bob');

      expect(result).toBeUndefined();
    });
  });

  describe('addOne', () => {
    it('should insert new user and return user info', async () => {
      const newUser = {
        username: 'charlie',
        email: 'charlie@example.com',
        passwordHash: 'hashedpassword',
      };

      const returnedUser = {
        userId: 'uuid-charlie',
        username: 'charlie',
        email: 'charlie@example.com',
      };

      const returningMock = vi.fn().mockResolvedValue([returnedUser]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      const result = await service.addOne(newUser);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledWith({
        username: newUser.username,
        email: newUser.email,
        password_hash: newUser.passwordHash,
      });
      expect(result).toEqual(returnedUser);
    });
  });
});

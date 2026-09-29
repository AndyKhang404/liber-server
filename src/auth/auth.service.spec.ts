import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, PasswordService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AuthService and PasswordService', () => {
  describe('PasswordService', () => {
    let passwordService: PasswordService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [PasswordService],
      }).compile();

      passwordService = module.get<PasswordService>(PasswordService);
    });

    it('should be defined', () => {
      expect(passwordService).toBeDefined();
    });

    it('should hash a password and verify it successfully', async () => {
      const plain = 'superSecretPassword123';
      const hash = await passwordService.hash(plain);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(plain);

      const isValid = await passwordService.verify(hash, plain);
      expect(isValid).toBe(true);

      const isInvalid = await passwordService.verify(hash, 'wrongPassword');
      expect(isInvalid).toBe(false);
    });

    it('should throw InternalServerErrorException when argon2.hash throws', async () => {
      await expect((passwordService as any).hash(12345)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw InternalServerErrorException when argon2.verify throws on corrupted hash', async () => {
      await expect(
        passwordService.verify('invalid-corrupted-hash', 'pass'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('AuthService', () => {
    let authService: AuthService;
    let usersService: { findOne: any; addOne: any };
    let passwordService: { hash: any; verify: any };

    beforeEach(async () => {
      usersService = {
        findOne: vi.fn(),
        addOne: vi.fn(),
      };
      passwordService = {
        hash: vi.fn(),
        verify: vi.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: UsersService,
            useValue: usersService,
          },
          {
            provide: PasswordService,
            useValue: passwordService,
          },
        ],
      }).compile();

      authService = module.get<AuthService>(AuthService);
    });

    it('should be defined', () => {
      expect(authService).toBeDefined();
    });

    describe('generateToken and verifyToken', () => {
      it('should generate a token and verify it returning the payload', async () => {
        const payload = { sub: 'user-id-123', username: 'testuser' };
        const token = await authService.generateToken(payload);

        expect(typeof token).toBe('string');

        const verified = await authService.verifyToken(token);
        expect(verified.sub).toBe('user-id-123');
        expect(verified.username).toBe('testuser');
        expect(verified.iss).toBe('urn:liber-server:issuer');
        expect(verified.aud).toBe('urn:liber-server:audience');
      });

      it('should throw UnauthorizedException when verifying invalid token', async () => {
        await expect(authService.verifyToken('invalid.token.here')).rejects.toThrow(
          new UnauthorizedException('Invalid or expired token'),
        );
      });
    });

    describe('signIn', () => {
      it('should throw UnauthorizedException if user does not exist', async () => {
        usersService.findOne.mockResolvedValue(undefined);

        await expect(
          authService.signIn('nonexistent', 'password123'),
        ).rejects.toThrow(new UnauthorizedException('Wrong username or password'));

        expect(usersService.findOne).toHaveBeenCalledWith('nonexistent');
        expect(passwordService.verify).not.toHaveBeenCalled();
      });

      it('should throw UnauthorizedException if password does not match', async () => {
        usersService.findOne.mockResolvedValue({
          userId: 'user-123',
          username: 'testuser',
          passwordHash: 'hash-abc',
        });
        passwordService.verify.mockResolvedValue(false);

        await expect(
          authService.signIn('testuser', 'wrongpassword'),
        ).rejects.toThrow(new UnauthorizedException('Wrong username or password'));

        expect(passwordService.verify).toHaveBeenCalledWith(
          'hash-abc',
          'wrongpassword',
        );
      });

      it('should return access_token when username and password are valid', async () => {
        usersService.findOne.mockResolvedValue({
          userId: 'user-123',
          username: 'testuser',
          passwordHash: 'hash-abc',
        });
        passwordService.verify.mockResolvedValue(true);

        const result = await authService.signIn('testuser', 'correctpassword');

        expect(result).toHaveProperty('access_token');
        expect(typeof result.access_token).toBe('string');

        const decoded = await authService.verifyToken(result.access_token);
        expect(decoded.sub).toBe('user-123');
        expect(decoded.username).toBe('testuser');
      });
    });

    describe('signUp', () => {
      it('should throw ConflictException if username already exists', async () => {
        usersService.findOne.mockResolvedValue({
          userId: 'user-123',
          username: 'existinguser',
        });

        await expect(
          authService.signUp('existinguser', 'email@test.com', 'password123'),
        ).rejects.toThrow(new ConflictException('Username has been taken'));

        expect(passwordService.hash).not.toHaveBeenCalled();
        expect(usersService.addOne).not.toHaveBeenCalled();
      });

      it('should throw InternalServerErrorException if usersService.addOne fails', async () => {
        usersService.findOne.mockResolvedValue(undefined);
        passwordService.hash.mockResolvedValue('hashed-pass');
        usersService.addOne.mockResolvedValue(null);

        await expect(
          authService.signUp('newuser', 'email@test.com', 'password123'),
        ).rejects.toThrow(InternalServerErrorException);

        expect(passwordService.hash).toHaveBeenCalledWith('password123');
        expect(usersService.addOne).toHaveBeenCalledWith({
          username: 'newuser',
          email: 'email@test.com',
          passwordHash: 'hashed-pass',
        });
      });

      it('should successfully sign up a new user', async () => {
        usersService.findOne.mockResolvedValue(undefined);
        passwordService.hash.mockResolvedValue('hashed-pass');
        usersService.addOne.mockResolvedValue({
          userId: 'new-id',
          username: 'newuser',
          email: 'email@test.com',
        });

        await expect(
          authService.signUp('newuser', 'email@test.com', 'password123'),
        ).resolves.toBeUndefined();

        expect(passwordService.hash).toHaveBeenCalledWith('password123');
        expect(usersService.addOne).toHaveBeenCalledWith({
          username: 'newuser',
          email: 'email@test.com',
          passwordHash: 'hashed-pass',
        });
      });
    });
  });
});

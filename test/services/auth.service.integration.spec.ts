import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, PasswordService } from '../../src/auth/auth.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { DbService } from '../../src/db/db.service.js';
import { createMockDb } from '../helpers/mock-db.js';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthService Integration', () => {
  let authService: AuthService;
  let passwordService: PasswordService;
  let usersService: UsersService;
  let mockDbInstance: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDbInstance = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        UsersService,
        {
          provide: DbService,
          useValue: { db: mockDbInstance.db },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    passwordService = module.get<PasswordService>(PasswordService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('Full Signup and Signin Lifecycle', () => {
    it('should complete registration, authenticate with valid credentials, and verify JWT token', async () => {
      const username = 'jane_doe';
      const email = 'jane@example.com';
      const password = 'CorrectHorseBatteryStaple123!';

      // 1. Sign up new user
      await expect(
        authService.signUp(username, email, password),
      ).resolves.toBeUndefined();

      // Verify user was stored in database with Argon2 hash
      const dbUser = await usersService.findOne(username);
      expect(dbUser).toBeDefined();
      expect(dbUser?.username).toBe(username);
      expect(dbUser?.email).toBe(email);
      expect(dbUser?.passwordHash).toMatch(/^\$argon2id\$/);

      // Verify the Argon2 hash is indeed valid for the password
      const isPasswordValid = await passwordService.verify(
        dbUser!.passwordHash,
        password,
      );
      expect(isPasswordValid).toBe(true);

      // 2. Reject duplicate signup
      await expect(
        authService.signUp(username, 'different@example.com', 'otherPass'),
      ).rejects.toThrow(ConflictException);

      // 3. Reject login with wrong password
      await expect(
        authService.signIn(username, 'WrongPassword'),
      ).rejects.toThrow(new UnauthorizedException('Wrong username or password'));

      // 4. Reject login with nonexistent user
      await expect(
        authService.signIn('nonexistent_user', password),
      ).rejects.toThrow(new UnauthorizedException('Wrong username or password'));

      // 5. Successful login returns JWT
      const loginResult = await authService.signIn(username, password);
      expect(loginResult).toHaveProperty('access_token');
      expect(typeof loginResult.access_token).toBe('string');

      // 6. Verify and decode the JWT access token
      const claims = await authService.verifyToken(loginResult.access_token);
      expect(claims.sub).toBe(dbUser?.userId);
      expect(claims.username).toBe(username);
      expect(claims.iss).toBe('urn:liber-server:issuer');
      expect(claims.aud).toBe('urn:liber-server:audience');
    });

    it('should reject tampered or corrupted JWT tokens', async () => {
      const token = await authService.generateToken({
        sub: 'some-user',
        username: 'some_user',
      });

      // Tamper with the signature portion
      const parts = token.split('.');
      const tamperedSignature =
        parts[2].slice(0, -4) + (parts[2].endsWith('A') ? 'B' : 'A');
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

      await expect(authService.verifyToken(tamperedToken)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should authenticate the built-in debug user "khang"', async () => {
      // debugUser has username: 'khang'
      // passwordHash in code corresponds to a known argon2 hash
      const user = await usersService.findOne('khang');
      expect(user).toBeDefined();
      expect(user?.userId).toBe('1');
      expect(user?.username).toBe('khang');
      expect(user?.email).toBe('andykhang404@gmail.com');
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  userInfoSchema,
  userSchema,
  userResponseSchema,
} from './index.js';

describe('Users Zod DTOs', () => {
  describe('createUserSchema', () => {
    it('should validate valid user creation data', () => {
      const valid = {
        username: 'stoic_user',
        email: 'user@example.com',
        password: 'securepassword123',
      };
      const result = createUserSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(valid);
      }
    });

    it('should fail when username is shorter than 3 characters', () => {
      const invalid = {
        username: 'ab',
        email: 'user@example.com',
        password: 'securepassword123',
      };
      const result = createUserSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should fail when username is longer than 32 characters', () => {
      const invalid = {
        username: 'a'.repeat(33),
        email: 'user@example.com',
        password: 'securepassword123',
      };
      const result = createUserSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should fail with invalid email', () => {
      const invalid = {
        username: 'validuser',
        email: 'not-an-email',
        password: 'securepassword123',
      };
      const result = createUserSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should fail when password is shorter than 6 characters', () => {
      const invalid = {
        username: 'validuser',
        email: 'user@example.com',
        password: '12345',
      };
      const result = createUserSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should fail when password is longer than 128 characters', () => {
      const invalid = {
        username: 'validuser',
        email: 'user@example.com',
        password: 'p'.repeat(129),
      };
      const result = createUserSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('updateUserSchema', () => {
    it('should allow partial valid updates', () => {
      expect(
        updateUserSchema.safeParse({ username: 'newname' }).success,
      ).toBe(true);
      expect(
        updateUserSchema.safeParse({ email: 'new@example.com' }).success,
      ).toBe(true);
      expect(
        updateUserSchema.safeParse({ password: 'newpassword123' }).success,
      ).toBe(true);
      expect(updateUserSchema.safeParse({}).success).toBe(true);
    });

    it('should reject invalid values on update fields', () => {
      expect(updateUserSchema.safeParse({ username: 'x' }).success).toBe(false);
      expect(
        updateUserSchema.safeParse({ email: 'invalid-email' }).success,
      ).toBe(false);
      expect(updateUserSchema.safeParse({ password: '123' }).success).toBe(
        false,
      );
    });
  });

  describe('userInfoSchema & userSchema', () => {
    it('should validate valid user info with password hash', () => {
      const info = {
        username: 'stoic',
        email: 'stoic@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
      };
      const result = userInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it('should validate full user entity with userId', () => {
      const user = {
        userId: '1',
        username: 'stoic',
        email: 'stoic@example.com',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
      };
      const result = userSchema.safeParse(user);
      expect(result.success).toBe(true);
    });
  });

  describe('userResponseSchema', () => {
    it('should validate user response payload without exposing passwordHash', () => {
      const res = {
        userId: 'uuid-1234',
        username: 'stoic',
        email: 'stoic@example.com',
      };
      const result = userResponseSchema.safeParse(res);
      expect(result.success).toBe(true);
    });
  });
});

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { type UserInfo, UsersService } from '../users/users.service.js';
import * as jose from 'jose';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    try {
      return await argon2.hash(password);
    } catch {
      throw new InternalServerErrorException();
    }
  }

  async verify(digest: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(digest, password);
    } catch {
      throw new InternalServerErrorException();
    }
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  private readonly secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'mysecretmysecretmysecretmysecret',
  );

  async generateToken(payload: jose.JWTPayload): Promise<string> {
    return await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('urn:liber-server:issuer')
      .setAudience('urn:liber-server:audience')
      .setExpirationTime('2h')
      .sign(this.secret);
  }

  async verifyToken(token: string) {
    try {
      const { payload } = await jose.jwtVerify(token, this.secret, {
        issuer: 'urn:liber-server:issuer',
        audience: 'urn:liber-server:audience',
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async signIn(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (
      !user ||
      !(await this.passwordService.verify(user.passwordHash, pass))
    ) {
      throw new UnauthorizedException('Wrong username or password');
    }
    const payload = { sub: user.userId, username: user.username };
    return {
      access_token: await this.generateToken(payload),
    };
  }

  async signUp(username: string, email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user) {
      throw new ConflictException('Username has been taken');
    }
    const passwordHash = await this.passwordService.hash(pass);
    const newUser: UserInfo = { username, email, passwordHash };
    if (!(await this.usersService.addOne(newUser))) {
      throw new InternalServerErrorException();
    }
  }
}

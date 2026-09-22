import { Injectable, NotFoundException } from '@nestjs/common';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service.js';

export type UserInfo = {
  username: string;
  email: string;
  passwordHash: string;
};

export type User = UserInfo & {
  userId: string;
};

@Injectable()
export class UsersService {
  private readonly debugUser: User = {
    userId: '1',
    username: 'khang',
    email: 'andykhang404@gmail.com',
    passwordHash:
      '$argon2id$v=19$m=65536,t=3,p=4$aTVQODEwYlpyM1N3RXBWWQ$4ENpsUADSByQ55Hg5KXW7g',
  };

  constructor(private readonly database: DbService) {}

  async findOne(username: string): Promise<User | undefined> {
    if (username == 'khang') return this.debugUser;
    const [user] = await this.database.db
      .select({
        username: users.username,
        email: users.email,
        passwordHash: users.password_hash,
        userId: users.user_id,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return user;
  }

  async addOne(userInfo: UserInfo) {
    const [user] = await this.database.db
      .insert(users)
      .values({
        username: userInfo.username,
        email: userInfo.email,
        password_hash: userInfo.passwordHash,
      })
      .returning({
        userId: users.user_id,
        username: users.username,
        email: users.email,
      });
    return user;
  }
}

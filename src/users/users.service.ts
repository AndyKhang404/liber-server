import { Injectable } from '@nestjs/common';

// TODO
export type UserInfo = {
  username: string;
  email: string;
  digest: string;
};

export type User = UserInfo & {
  userId: string;
};

@Injectable()
export class UsersService {
  private readonly users: User[] = [
    {
      userId: '1',
      username: 'khang',
      email: 'andykhang404@gmail.com',
      digest:
        '$argon2id$v=19$m=65536,p=4,t=3$t461LocQt9e+/WX0f9yORQ$gT9UA3uep5ftYslADyEpid4LmXXYAqWpNR5IeVo/iq8',
    },
  ];

  async findOne(username: string): Promise<User | undefined> {
    return this.users.find((user) => user.username === username);
  }

  async addOne(user: UserInfo): Promise<boolean> {
    this.users.push({ userId: (this.users.length + 1).toString(), ...user });
    return true;
  }
}

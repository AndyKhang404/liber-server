import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { DbModule } from '../db/db.module.js';

@Module({
  imports: [DbModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

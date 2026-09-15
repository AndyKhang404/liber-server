import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService, PasswordService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  imports: [UsersModule],
  exports: [AuthService],
})
export class AuthModule {}

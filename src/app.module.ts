import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { DbModule } from './db/db.module.js';

@Module({
  imports: [AuthModule, UsersModule, DbModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

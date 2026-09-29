import { Module } from '@nestjs/common';
import { BooksService } from './books.service.js';
import { BooksController } from './books.controller.js';
import { DbModule } from '../db/db.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [DbModule, AuthModule, StorageModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}

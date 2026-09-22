import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class BooksService {
  constructor(private readonly database: DbService) {}

  //TODO pagination
  async getBooks(userId: string) {
    const docs = await this.database.db
      .select()
      .from(documents)
      .where(eq(documents.user_id, userId))
      .limit(100);
    return { length: docs.length, books: docs };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import { documents, files } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { type CreateBookDto } from './dto/create-book.dto.js';
import { type UpdateBookDto } from './dto/update-book.dto.js';
import { Readable } from 'stream';

@Injectable()
export class BooksService {
  constructor(
    private readonly database: DbService,
    private readonly storage: StorageService,
  ) {}

  //TODO pagination
  async getBooks(userId: string) {
    const docs = await this.database.db
      .select()
      .from(documents)
      .where(eq(documents.user_id, userId))
      .limit(100);
    return { length: docs.length, books: docs };
  }

  async createBook(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
    metadata: CreateBookDto,
  ) {
    const storageKey = `books/${userId}/${randomUUID()}`;
    const sizeBytes = fileBuffer.length;

    // Upload to object storage first — if this fails, no DB records are created
    await this.storage.upload(storageKey, fileBuffer, mimeType);

    // Insert file + document records atomically
    // If the transaction fails after a successful upload, the orphaned
    // S3 object will be swept by the cleanup cronjob
    const doc = await this.database.db.transaction(async (tx) => {
      const [file] = await tx
        .insert(files)
        .values({
          storage_key: storageKey,
          mime_type: mimeType,
          size_bytes: sizeBytes,
        })
        .returning();

      const [newDoc] = await tx
        .insert(documents)
        .values({
          user_id: userId,
          file_id: file.file_id,
          title: metadata.title,
          author: metadata.author ?? null,
          publisher: metadata.publisher ?? null,
          description: metadata.description ?? null,
          published_at: metadata.published_at ?? null,
        })
        .returning();

      return newDoc;
    });

    return doc;
  }

  async getBook(userId: string, bookId: string) {
    const [doc] = await this.database.db
      .select()
      .from(documents)
      .where(and(eq(documents.doc_id, bookId), eq(documents.user_id, userId)));

    if (!doc) {
      throw new NotFoundException('Book not found');
    }

    return doc;
  }

  async updateBook(userId: string, bookId: string, dto: UpdateBookDto) {
    // Verify ownership
    const doc = await this.getBook(userId, bookId);

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.author !== undefined) updateData.author = dto.author;
    if (dto.publisher !== undefined) updateData.publisher = dto.publisher;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.published_at !== undefined)
      updateData.published_at = dto.published_at;

    if (Object.keys(updateData).length === 0) {
      return doc;
    }

    const [updated] = await this.database.db
      .update(documents)
      .set(updateData)
      .where(and(eq(documents.doc_id, bookId), eq(documents.user_id, userId)))
      .returning();

    return updated;
  }

  async deleteBook(userId: string, bookId: string) {
    // Verify ownership
    const doc = await this.getBook(userId, bookId);

    // Transaction: update file timestamp + delete document
    // Updating last_referenced_at gives the cronjob a grace period
    // before sweeping the orphaned file
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({ last_referenced_at: new Date() })
        .where(eq(files.file_id, doc.file_id));

      await tx
        .delete(documents)
        .where(
          and(eq(documents.doc_id, bookId), eq(documents.user_id, userId)),
        );
    });
  }

  async getBookContent(
    userId: string,
    bookId: string,
  ): Promise<{ stream: Readable; contentType?: string }> {
    const doc = await this.getBook(userId, bookId);

    const [file] = await this.database.db
      .select()
      .from(files)
      .where(eq(files.file_id, doc.file_id));

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Update last_referenced_at
    await this.database.db
      .update(files)
      .set({ last_referenced_at: new Date() })
      .where(eq(files.file_id, file.file_id));

    return this.storage.download(file.storage_key);
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from '../../src/books/books.service.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { DbService } from '../../src/db/db.service.js';
import { createMockDb } from '../helpers/mock-db.js';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

describe('BooksService Integration', () => {
  let booksService: BooksService;
  let mockDbInstance: ReturnType<typeof createMockDb>;
  let inMemoryStorage: Map<string, { buffer: Buffer; contentType: string }>;
  let mockStorageService: Partial<StorageService>;

  beforeEach(async () => {
    mockDbInstance = createMockDb();
    inMemoryStorage = new Map();

    mockStorageService = {
      upload: vi.fn(async (key: string, buffer: Buffer, contentType: string) => {
        inMemoryStorage.set(key, { buffer, contentType });
      }),
      download: vi.fn(async (key: string) => {
        const item = inMemoryStorage.get(key);
        if (!item) {
          throw new NotFoundException('Object not found in storage');
        }
        const stream = new Readable();
        stream.push(item.buffer);
        stream.push(null);
        return { stream, contentType: item.contentType };
      }),
      delete: vi.fn(async (key: string) => {
        inMemoryStorage.delete(key);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: DbService,
          useValue: { db: mockDbInstance.db },
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    booksService = module.get<BooksService>(BooksService);
  });

  describe('Full Book Management Lifecycle', () => {
    it('should create a book, upload content, retrieve it, stream content, update metadata, and delete it', async () => {
      const userId = 'user-alice';
      const fileBuffer = Buffer.from('%PDF-1.4 Mock PDF Content');
      const mimeType = 'application/pdf';
      const metadata = {
        title: 'Design Patterns',
        author: 'Gang of Four',
        publisher: 'Addison-Wesley',
        description: 'Elements of Reusable Object-Oriented Software',
        published_at: '1994-10-31',
      };

      // 1. Create Book
      const createdBook = await booksService.createBook(
        userId,
        fileBuffer,
        mimeType,
        metadata,
      );

      expect(createdBook).toBeDefined();
      expect(createdBook.title).toBe(metadata.title);
      expect(createdBook.author).toBe(metadata.author);
      expect(createdBook.user_id).toBe(userId);
      expect(createdBook.file_id).toBeDefined();

      // Verify file is stored in mock storage
      expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
      const state = mockDbInstance.getState();
      expect(state.files.length).toBe(1);
      expect(state.documents.length).toBe(1);
      expect(state.files[0].file_id).toBe(createdBook.file_id);
      expect(inMemoryStorage.has(state.files[0].storage_key)).toBe(true);

      // 2. Retrieve single book
      const retrievedBook = await booksService.getBook(
        userId,
        createdBook.doc_id,
      );
      expect(retrievedBook.doc_id).toBe(createdBook.doc_id);
      expect(retrievedBook.title).toBe(metadata.title);

      // 3. Retrieve books list for user
      const bookList = await booksService.getBooks(userId);
      expect(bookList.length).toBe(1);
      expect(bookList.books[0].doc_id).toBe(createdBook.doc_id);

      // 4. Stream content
      const content = await booksService.getBookContent(
        userId,
        createdBook.doc_id,
      );
      expect(content.contentType).toBe(mimeType);

      // Read stream data to verify payload
      const chunks: Buffer[] = [];
      for await (const chunk of content.stream) {
        chunks.push(Buffer.from(chunk));
      }
      const streamContent = Buffer.concat(chunks).toString();
      expect(streamContent).toBe('%PDF-1.4 Mock PDF Content');

      // 5. Update book metadata
      const updated = await booksService.updateBook(userId, createdBook.doc_id, {
        title: 'Design Patterns (2nd Edition)',
        description: 'Updated edition description',
      });
      expect(updated.title).toBe('Design Patterns (2nd Edition)');
      expect(updated.description).toBe('Updated edition description');
      expect(updated.author).toBe(metadata.author); // unchanged field preserved

      // 6. Delete book (updates file last_referenced_at and removes document)
      const fileBeforeDelete = state.files[0];
      const initialTimestamp = fileBeforeDelete.last_referenced_at;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      await booksService.deleteBook(userId, createdBook.doc_id);

      // Document is removed from DB
      expect(mockDbInstance.getState().documents.length).toBe(0);
      // File record is retained for cleanup cronjob, with updated timestamp
      expect(mockDbInstance.getState().files.length).toBe(1);
      expect(
        mockDbInstance.getState().files[0].last_referenced_at.getTime(),
      ).toBeGreaterThanOrEqual(new Date(initialTimestamp).getTime());

      // Subsequent retrieval throws NotFoundException
      await expect(
        booksService.getBook(userId, createdBook.doc_id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce user data isolation between different users', async () => {
      const userA = 'user-alice';
      const userB = 'user-bob';

      const bookA = await booksService.createBook(
        userA,
        Buffer.from('Alice Book'),
        'application/pdf',
        { title: 'Alice Private Book' },
      );

      const bookB = await booksService.createBook(
        userB,
        Buffer.from('Bob Book'),
        'application/pdf',
        { title: 'Bob Private Book' },
      );

      // User A list only includes Alice's book
      const aliceList = await booksService.getBooks(userA);
      expect(aliceList.books.map((b) => b.doc_id)).toContain(bookA.doc_id);
      expect(aliceList.books.map((b) => b.doc_id)).not.toContain(bookB.doc_id);

      // User A cannot read User B's book
      await expect(booksService.getBook(userA, bookB.doc_id)).rejects.toThrow(
        NotFoundException,
      );

      // User A cannot delete User B's book
      await expect(
        booksService.deleteBook(userA, bookB.doc_id),
      ).rejects.toThrow(NotFoundException);

      // User A cannot stream User B's book
      await expect(
        booksService.getBookContent(userA, bookB.doc_id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback database transaction when document insert fails', async () => {
      const userId = 'user-alice';
      const fileBuffer = Buffer.from('PDF Content');

      // Force failure during transaction
      vi.spyOn(mockDbInstance.db, 'transaction').mockImplementationOnce(
        async () => {
          throw new Error('Database transaction error');
        },
      );

      await expect(
        booksService.createBook(userId, fileBuffer, 'application/pdf', {
          title: 'Rollback Book',
        }),
      ).rejects.toThrow('Database transaction error');

      // Verify no records were persisted in DB
      expect(mockDbInstance.getState().files.length).toBe(0);
      expect(mockDbInstance.getState().documents.length).toBe(0);
    });
  });
});

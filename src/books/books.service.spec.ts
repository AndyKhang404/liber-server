import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service.js';
import { DbService } from '../db/db.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

describe('BooksService', () => {
  let service: BooksService;
  let mockDb: any;
  let mockStorage: { upload: any; download: any; delete: any };

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    };

    mockStorage = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: DbService,
          useValue: { db: mockDb },
        },
        {
          provide: StorageService,
          useValue: mockStorage,
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBooks', () => {
    it('should return books list for a user with length', async () => {
      const mockDocs = [
        { doc_id: 'doc-1', title: 'Book One', user_id: 'user-1' },
        { doc_id: 'doc-2', title: 'Book Two', user_id: 'user-1' },
      ];

      const limitMock = vi.fn().mockResolvedValue(mockDocs);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const result = await service.getBooks('user-1');

      expect(mockDb.select).toHaveBeenCalled();
      expect(limitMock).toHaveBeenCalledWith(100);
      expect(result).toEqual({ length: 2, books: mockDocs });
    });
  });

  describe('createBook', () => {
    it('should upload file and insert file + document in a transaction', async () => {
      const userId = 'user-123';
      const fileBuffer = Buffer.from('dummy pdf content');
      const mimeType = 'application/pdf';
      const metadata = {
        title: 'Clean Architecture',
        author: 'Uncle Bob',
        publisher: 'Prentice Hall',
        description: 'Software architecture guide',
        published_at: '2017-09-20',
      };

      mockStorage.upload.mockResolvedValue(undefined);

      const createdFile = {
        file_id: 'file-uuid-1',
        storage_key: 'books/user-123/file-uuid-1',
      };
      const createdDoc = {
        doc_id: 'doc-uuid-1',
        user_id: userId,
        file_id: createdFile.file_id,
        ...metadata,
      };

      mockDb.transaction.mockImplementation(async (callback: any) => {
        const tx = {
          insert: vi.fn((table: any) => ({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                // If files table, return file; if documents table, return doc
                table === undefined || tx.insert.mock.calls.length === 1
                  ? createdFile
                  : createdDoc,
              ]),
            }),
          })),
        };
        return callback(tx);
      });

      const result = await service.createBook(
        userId,
        fileBuffer,
        mimeType,
        metadata,
      );

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringContaining(`books/${userId}/`),
        fileBuffer,
        mimeType,
      );
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should not start transaction if storage upload throws', async () => {
      mockStorage.upload.mockRejectedValue(new Error('Storage failure'));

      await expect(
        service.createBook('user-1', Buffer.from('data'), 'application/pdf', {
          title: 'Fail Book',
        }),
      ).rejects.toThrow('Storage failure');

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getBook', () => {
    it('should return document if found for the user', async () => {
      const mockDoc = { doc_id: 'doc-1', user_id: 'user-1', title: 'Test Book' };
      const whereMock = vi.fn().mockResolvedValue([mockDoc]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const result = await service.getBook('user-1', 'doc-1');

      expect(result).toEqual(mockDoc);
    });

    it('should throw NotFoundException if document not found', async () => {
      const whereMock = vi.fn().mockResolvedValue([]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      await expect(service.getBook('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateBook', () => {
    it('should return existing document without updating if no fields provided', async () => {
      const mockDoc = { doc_id: 'doc-1', user_id: 'user-1', title: 'Test Book' };
      vi.spyOn(service, 'getBook').mockResolvedValue(mockDoc as any);

      const result = await service.updateBook('user-1', 'doc-1', {});

      expect(result).toEqual(mockDoc);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should update document with provided fields and return updated document', async () => {
      const mockDoc = { doc_id: 'doc-1', user_id: 'user-1', title: 'Test Book' };
      vi.spyOn(service, 'getBook').mockResolvedValue(mockDoc as any);

      const updatedDoc = { ...mockDoc, title: 'Updated Title' };
      const returningMock = vi.fn().mockResolvedValue([updatedDoc]);
      const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.update.mockReturnValue({ set: setMock });

      const result = await service.updateBook('user-1', 'doc-1', {
        title: 'Updated Title',
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalledWith({ title: 'Updated Title' });
      expect(result).toEqual(updatedDoc);
    });
  });

  describe('deleteBook', () => {
    it('should verify ownership and update file timestamp and delete document in transaction', async () => {
      const mockDoc = {
        doc_id: 'doc-1',
        user_id: 'user-1',
        file_id: 'file-1',
      };
      vi.spyOn(service, 'getBook').mockResolvedValue(mockDoc as any);

      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback({ update: txUpdate, delete: txDelete });
      });

      await service.deleteBook('user-1', 'doc-1');

      expect(service.getBook).toHaveBeenCalledWith('user-1', 'doc-1');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(txUpdate).toHaveBeenCalled();
      expect(txDelete).toHaveBeenCalled();
    });
  });

  describe('getBookContent', () => {
    it('should throw NotFoundException if file record is not found', async () => {
      const mockDoc = {
        doc_id: 'doc-1',
        user_id: 'user-1',
        file_id: 'file-missing',
      };
      vi.spyOn(service, 'getBook').mockResolvedValue(mockDoc as any);

      const whereMock = vi.fn().mockResolvedValue([]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      await expect(service.getBookContent('user-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update file timestamp and download stream from storage', async () => {
      const mockDoc = {
        doc_id: 'doc-1',
        user_id: 'user-1',
        file_id: 'file-1',
      };
      const mockFile = {
        file_id: 'file-1',
        storage_key: 'books/user-1/uuid.pdf',
      };

      vi.spyOn(service, 'getBook').mockResolvedValue(mockDoc as any);

      const whereSelectMock = vi.fn().mockResolvedValue([mockFile]);
      const fromMock = vi.fn().mockReturnValue({ where: whereSelectMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const whereUpdateMock = vi.fn().mockResolvedValue(undefined);
      const setMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
      mockDb.update.mockReturnValue({ set: setMock });

      const mockStream = new Readable();
      mockStorage.download.mockResolvedValue({
        stream: mockStream,
        contentType: 'application/pdf',
      });

      const result = await service.getBookContent('user-1', 'doc-1');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockStorage.download).toHaveBeenCalledWith(mockFile.storage_key);
      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('application/pdf');
    });
  });
});

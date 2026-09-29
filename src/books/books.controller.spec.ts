import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';
import { AuthService } from '../auth/auth.service.js';

describe('BooksController', () => {
  let controller: BooksController;
  let mockBooksService: {
    getBooks: any;
    createBook: any;
    getBook: any;
    updateBook: any;
    deleteBook: any;
    getBookContent: any;
  };
  let mockAuthService: { verifyToken: any };

  beforeEach(async () => {
    mockBooksService = {
      getBooks: vi.fn(),
      createBook: vi.fn(),
      getBook: vi.fn(),
      updateBook: vi.fn(),
      deleteBook: vi.fn(),
      getBookContent: vi.fn(),
    };

    mockAuthService = {
      verifyToken: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: mockBooksService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<BooksController>(BooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

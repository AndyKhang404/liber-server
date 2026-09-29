import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  Param,
  Body,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BooksService } from './books.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { type UserRequest } from '../auth/auth.controller.js';
import { ZodValidationPipe } from '../common/zodvalidation.pipe.js';
import { type CreateBookDto, createBookSchema } from './dto/create-book.dto.js';
import { type UpdateBookDto, updateBookSchema } from './dto/update-book.dto.js';
import { type Response } from 'express';

interface UploadedFileInfo {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Controller('books')
@UseGuards(AuthGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  private getUserId(req: UserRequest): string {
    if (!req.user.sub || typeof req.user.sub !== 'string') {
      throw new UnauthorizedException();
    }
    return req.user.sub;
  }

  @Get()
  getBooks(@Req() req: UserRequest) {
    return this.booksService.getBooks(this.getUserId(req));
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    }),
  )
  createBook(
    @Req() req: UserRequest,
    @UploadedFile() file: UploadedFileInfo,
    @Body('metadata') metadataRaw: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    let metadata: CreateBookDto;
    try {
      const parsed = JSON.parse(metadataRaw);
      metadata = createBookSchema.parse(parsed);
    } catch {
      throw new BadRequestException(
        'Invalid metadata: must be valid JSON matching the book schema',
      );
    }

    return this.booksService.createBook(
      this.getUserId(req),
      file.buffer,
      file.mimetype,
      metadata,
    );
  }

  @Get(':bookId')
  getBook(@Req() req: UserRequest, @Param('bookId') bookId: string) {
    return this.booksService.getBook(this.getUserId(req), bookId);
  }

  @Patch(':bookId')
  updateBook(
    @Req() req: UserRequest,
    @Param('bookId') bookId: string,
    @Body(new ZodValidationPipe(updateBookSchema)) dto: UpdateBookDto,
  ) {
    return this.booksService.updateBook(this.getUserId(req), bookId, dto);
  }

  @Delete(':bookId')
  async deleteBook(@Req() req: UserRequest, @Param('bookId') bookId: string) {
    await this.booksService.deleteBook(this.getUserId(req), bookId);
    return { message: 'Book deleted' };
  }

  @Get(':bookId/content')
  async getBookContent(
    @Req() req: UserRequest,
    @Param('bookId') bookId: string,
    @Res() res: Response,
  ) {
    const { stream, contentType } = await this.booksService.getBookContent(
      this.getUserId(req),
      bookId,
    );

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    stream.pipe(res);
  }
}

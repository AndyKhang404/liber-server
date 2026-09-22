import {
  Controller,
  Get,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { BooksService } from './books.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { type UserRequest } from '../auth/auth.controller.js';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @UseGuards(AuthGuard)
  @Get()
  getBooks(@Req() req: UserRequest) {
    if (!req.user.sub) throw new UnauthorizedException();
    return this.booksService.getBooks(req.user.sub);
  }
}

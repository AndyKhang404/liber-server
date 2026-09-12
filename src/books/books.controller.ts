import { Body, Controller, Get, Post, Ip, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('books')
export class BooksController {
  @Get()
  findAll(@Ip() ip: string): string {
    return `Request came from ${ip}`;
  }

  @Post()
  addOne(@Req() request: Request): string {
    return 'What was posted:\n' + JSON.stringify(request.body);
  }
}

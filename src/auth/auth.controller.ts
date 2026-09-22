import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Get,
  UsePipes,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { ZodValidationPipe } from '../common/zodvalidation.pipe.js';
import { type SignUpDto, signUpSchema } from './dto/signup.dto.js';
import { type SignInDto, signInSchema } from './dto/signin.dto.js';
import { type Request } from 'express';
import { JWTPayload } from 'jose';

export type UserRequest = Request & { user: JWTPayload };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UsePipes(new ZodValidationPipe(signInSchema))
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('signup')
  @UsePipes(new ZodValidationPipe(signUpSchema))
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(
      signUpDto.username,
      signUpDto.email,
      signUpDto.password,
    );
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Req() req: UserRequest) {
    return req.user;
  }
}

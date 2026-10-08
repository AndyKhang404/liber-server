import { describe, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eContext, E2eContext } from './helpers/e2e-context.js';

describe('AppController (e2e)', () => {
  let ctx: E2eContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createE2eContext();
    app = ctx.app;
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!\n');
  });
});

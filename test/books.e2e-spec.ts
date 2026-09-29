import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { startTestEnvironment, cleanDatabase } from './helpers/testcontainers-environment.js';

describe('BooksController (e2e)', () => {
  let app: INestApplication;
  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    await startTestEnvironment();

    // Clean database before starting books test suite
    await cleanDatabase();

    // Zero mocks: connects to real PostgreSQL and real S3
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Create User A
    await request(app.getHttpServer()).post('/auth/signup').send({
      username: 'user_a',
      email: 'usera@example.com',
      password: 'Password123!',
    });
    const loginA = await request(app.getHttpServer()).post('/auth/login').send({
      username: 'user_a',
      password: 'Password123!',
    });
    tokenUserA = loginA.body.access_token;

    // Create User B
    await request(app.getHttpServer()).post('/auth/signup').send({
      username: 'user_b',
      email: 'userb@example.com',
      password: 'Password123!',
    });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({
      username: 'user_b',
      password: 'Password123!',
    });
    tokenUserB = loginB.body.access_token;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Authentication protection', () => {
    it('should reject unauthenticated requests to /books with 401', async () => {
      await request(app.getHttpServer()).get('/books').expect(401);
      await request(app.getHttpServer()).post('/books').expect(401);
      await request(app.getHttpServer()).get('/books/some-id').expect(401);
      await request(app.getHttpServer()).patch('/books/some-id').expect(401);
      await request(app.getHttpServer()).delete('/books/some-id').expect(401);
      await request(app.getHttpServer()).get('/books/some-id/content').expect(401);
    });
  });

  describe('Full Books CRUD and Streaming Lifecycle', () => {
    let createdBookId: string;
    const samplePdfBuffer = Buffer.from('%PDF-1.4 E2E Test Content with Real S3 Storage\n');

    it('GET /books initially returns empty array for user A', async () => {
      const res = await request(app.getHttpServer())
        .get('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body).toEqual({ length: 0, books: [] });
    });

    it('POST /books validates missing file and metadata', async () => {
      // Missing file
      const noFileRes = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .field('metadata', JSON.stringify({ title: 'Book' }))
        .expect(400);

      expect(noFileRes.body.message).toBe('File is required');

      // Invalid metadata JSON
      const invalidMetaRes = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .attach('file', samplePdfBuffer, 'book.pdf')
        .field('metadata', 'not-valid-json')
        .expect(400);

      expect(invalidMetaRes.body.message).toContain('Invalid metadata');
    });

    it('POST /books successfully creates a book with multipart upload', async () => {
      const metadata = {
        title: 'Structure and Interpretation of Computer Programs',
        author: 'Harold Abelson & Gerald Jay Sussman',
        publisher: 'MIT Press',
        description: 'Classic computer science textbook',
        published_at: '1996-08-01',
      };

      const res = await request(app.getHttpServer())
        .post('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .attach('file', samplePdfBuffer, 'sicp.pdf')
        .field('metadata', JSON.stringify(metadata))
        .expect(201);

      expect(res.body).toHaveProperty('doc_id');
      expect(res.body.title).toBe(metadata.title);
      expect(res.body.author).toBe(metadata.author);
      expect(res.body.publisher).toBe(metadata.publisher);
      expect(res.body.file_id).toBeDefined();

      createdBookId = res.body.doc_id;
    });

    it('GET /books lists created book for user A', async () => {
      const res = await request(app.getHttpServer())
        .get('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body.books[0].doc_id).toBe(createdBookId);
      expect(res.body.books[0].title).toBe(
        'Structure and Interpretation of Computer Programs',
      );
    });

    it('GET /books/:bookId retrieves book details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/books/${createdBookId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body.doc_id).toBe(createdBookId);
      expect(res.body.title).toBe(
        'Structure and Interpretation of Computer Programs',
      );
    });

    it('GET /books/:bookId returns 404 for nonexistent ID', async () => {
      await request(app.getHttpServer())
        .get('/books/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(404);
    });

    it('GET /books/:bookId returns 404 when accessed by another user (User B)', async () => {
      await request(app.getHttpServer())
        .get(`/books/${createdBookId}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(404);
    });

    it('GET /books/:bookId/content streams the PDF content back from real S3', async () => {
      const res = await request(app.getHttpServer())
        .get(`/books/${createdBookId}/content`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(res.body).equals(samplePdfBuffer)).toBe(true);
    });

    it('PATCH /books/:bookId updates book metadata in real PostgreSQL', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/books/${createdBookId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          title: 'SICP (2nd Edition)',
          description: 'Updated edition description',
        })
        .expect(200);

      expect(res.body.title).toBe('SICP (2nd Edition)');
      expect(res.body.description).toBe('Updated edition description');
      expect(res.body.author).toBe('Harold Abelson & Gerald Jay Sussman');
    });

    it('DELETE /books/:bookId removes the book', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/books/${createdBookId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Book deleted' });

      // Verification: subsequent GET returns 404
      await request(app.getHttpServer())
        .get(`/books/${createdBookId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(404);

      // Books list for User A is now empty
      const listRes = await request(app.getHttpServer())
        .get('/books')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(listRes.body.length).toBe(0);
    });
  });
});

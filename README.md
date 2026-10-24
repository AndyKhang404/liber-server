# liber-server

[![CI](https://github.com/AndyKhang404/liber-server/actions/workflows/ci.yml/badge.svg)](https://github.com/AndyKhang404/liber-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24-brightgreen?logo=node.js)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2849?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Vitest](https://img.shields.io/badge/tested%20with-vitest-yellow?logo=vitest&logoColor=white)](https://vitest.dev/)

A backend API for a personal PDF library.

`liber-server` is being built as a small, self-hosted backend for storing PDF documents, tracking reading progress, adding page bookmarks, and sharing documents with other users.

## Features

The initial scope of the project includes:

* User accounts and authentication
* PDF file uploads and storage
* Document metadata management
* Reading progress tracking
* Page bookmarks with descriptions
* Sharing documents with other users
* Reusing stored files when a document is shared
* Ownership and authorization at the service layer

The project intentionally keeps its initial scope small. Public book discovery, custom roles and permissions, and a plugin/pipeline system are potential future directions rather than current requirements.

## Tech stack

* **NestJS** — HTTP API and application framework
* **TypeScript** — application language
* **PostgreSQL** — relational database
* **MinIO** — S3-compatible object storage for PDF files
* **Drizzle ORM** — database access and migrations
* **Argon2** — password hashing
* **Zod** — runtime schema validation and static type inference for DTOs
* **Vitest** — unit, integration, and E2E test runner
* **Testcontainers** — automated, ephemeral Docker containers (PostgreSQL & S3) for E2E tests

## Architecture

The application separates a stored file from the user's document/library entry.

### Data model

```text
User
 │
 ├──< Document >── File
 │       │
 │       └──< Bookmark
 │
 └──< ShareHistory >── Share >── Document
```

### User

Stores account and authentication information.

Relevant fields include:

* `userId`
* `username`
* `email`
* `passwordHash`
* `verifiedAt`
* `createdAt`
* `lastLoginAt`

Passwords are stored as Argon2 hashes rather than plaintext.

### File

Represents the underlying stored file.

A `File` contains storage-related information such as:

* `fileId`
* `storageKey`
* `mimeType`
* `sizeBytes`
* `lastReferencedAt`

Files are kept separate from documents so that multiple document records can reference the same underlying file.

When a document's content is replaced, a new `File` is created rather than mutating the existing one. Files that are no longer referenced can later be cleaned up by a scheduled job.

### Document

Represents a user's library entry and its metadata.

A document contains:

* `docId`
* `userId`
* `fileId`
* `title`
* `author`
* `publisher`
* `description`
* `publishedAt`
* `createdAt`
* `readingProgress`

Reading progress belongs to the document owned by a particular user, rather than to the underlying file.

### Bookmark

Stores a page bookmark belonging to a document.

Each bookmark contains:

* `bookmarkId`
* `docId`
* `page`
* `content`

### Share

Represents an invitation to share a document.

A share contains:

* `shareId`
* `docId`
* `shareExpiredAt`
* `shareCount`

The owner does not need to be stored in `Share`, since ownership can be determined through the associated `Document`.

### ShareHistory

Tracks individual users claiming a share.

It contains:

* `userId`
* `shareId`
* `claimedAt`
* `claimedDocId`

Claiming a share creates a new `Document` for the recipient. The new document can reuse the original immutable `File`, while maintaining its own reading progress and bookmarks.

## API design

The API is organized around resources rather than database tables.

The intended API surface covers:

* Health checks
* Authentication and the current user
* Document creation, listing, retrieval, and deletion
* PDF content access
* Reading progress
* Bookmarks
* Document sharing and share claiming

Authenticated requests identify the current user through the authentication layer rather than accepting an arbitrary user ID in the URL.

Business rules such as document ownership and authorization are handled by application services rather than being left to controllers.

### Input validation

Request payloads and parameters are validated at runtime using [Zod](https://zod.dev/) schemas through a custom NestJS `ZodValidationPipe`. Static TypeScript types are inferred directly from schemas (`z.infer<typeof schema>`), providing compile-time type safety alongside runtime validation:

* **Authentication DTOs** (`src/auth/dto/`): `signUpSchema`, `signInSchema`
* **User DTOs** (`src/users/dto/`): `createUserSchema`, `updateUserSchema`, `userInfoSchema`, `userSchema`, `userResponseSchema`
* **Book DTOs** (`src/books/dto/`): `createBookSchema`, `updateBookSchema`

## Database

The project uses PostgreSQL with Drizzle ORM.

The database connection is configured through:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/pdf_server
```

### Generate a migration

After changing the Drizzle schema:

```bash
npm run db:generate
```

### Apply migrations

```bash
npm run db:migrate
```

For a new development database, configure `DATABASE_URL` and apply the generated migrations before starting the application.

## Object storage

PDF files are stored in MinIO (S3-compatible). Configure the connection through:

```env
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=liber-books
S3_REGION=us-east-1
```

The application auto-creates the bucket on startup if it doesn't exist.

## Docker Compose

A `docker-compose.yml` is provided to run PostgreSQL and MinIO locally:

```bash
docker compose up -d
```

## Project setup

Install dependencies:

```bash
npm install
```

Configure the required environment variables (`DATABASE_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`), then initialize the database using the Drizzle migration workflow above.

## Running the application

```bash
# development
npm run start

# watch mode
npm run start:dev

# production
npm run start:prod
```

## Testing

The project uses [Vitest](https://vitest.dev/) for both unit/integration tests and containerized end-to-end tests.

### Unit & service integration tests

Runs unit tests and service-layer integration tests:

```bash
npm run test
```

To run in watch mode:

```bash
npm run test:watch
```

### Fast in-memory E2E tests (`e2e:lite`)

Runs all HTTP route E2E tests against an in-memory database and storage mock for rapid local feedback without Docker overhead:

```bash
npm run test:e2e:lite
# or
npm run e2e:lite
```

### Containerized End-to-end (E2E) tests

E2E tests use **[Testcontainers](https://node.testcontainers.org/)** to spin up isolated, ephemeral PostgreSQL and S3 containers on random available ports:

```bash
npm run test:e2e
```

When running E2E tests:
1. Vitest global setup starts a real **PostgreSQL 18** container and a real **S3** container.
2. Drizzle schema migrations are automatically executed against the PostgreSQL container.
3. The NestJS application boots with zero mocks, connecting directly to the containerized database and object storage.
4. HTTP routes (`/auth/*`, `/books/*`, `/`) are tested end-to-end with [Supertest](https://github.com/ladjs/supertest).
5. All containers are automatically stopped and disposed when the test run completes.

> **Prerequisite:** Docker daemon must be running locally to run E2E tests.

### Test coverage

Runs the complete test suite (unit tests, service integration tests, and in-memory E2E tests) and generates coverage reports:

```bash
npm run test:cov
```

Coverage is collected using Vitest's V8 provider across all application code in `src/`, while excluding test fixtures and bootstrap code.

### Continuous Integration (CI)

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push to `main` and on all pull requests, executing three parallel jobs:

1. **Lint & build**: Verifies code quality with [Oxlint](https://oxc.rs/) and ensures clean compilation.
2. **Tests & coverage**: Runs `npm run test:cov` and uploads coverage reports as artifacts.
3. **E2E (Testcontainers)**: Boots PostgreSQL 18 and MinIO S3 containers to run full containerized integration tests.

## Development principles

A few design principles guide the project:

* **Keep the initial scope small.** New abstractions should solve an actual current requirement.
* **Separate domain concepts from storage.** A `Document` represents a user's library entry; a `File` represents stored content.
* **Use the database for invariants.** PostgreSQL constraints should enforce relationships and data integrity where appropriate.
* **Keep business logic out of controllers.** Controllers handle HTTP concerns while services handle application logic and authorization.
* **Validate at the boundary with Zod.** HTTP input data (bodies, query parameters, route parameters) is validated and parsed at the controller boundary using Zod schemas, ensuring strongly-typed, sanitized payloads reach services.
* **Use transactions for multi-step operations.** Operations such as claiming a share should be atomic.
* **Avoid premature generalization.** A future catalog, permission system, additional media types, or plugin architecture can be introduced when there is a concrete requirement for it.

### Future possibilities

These are deliberately outside the current scope:

* Public document/book discovery
* More expressive permission and role systems
* Support for manga, comics, visual novels, and other media
* Plugin systems, pipelines, and application hooks
* Production deployment and operational tooling

The goal is to get the core personal PDF library working well before expanding the architecture.

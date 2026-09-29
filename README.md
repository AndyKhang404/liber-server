# liber-server

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

### Unit tests

```bash
npm run test
```

### End-to-end tests

```bash
npm run test:e2e
```

### Test coverage

```bash
npm run test:cov
```

## Development principles

A few design principles guide the project:

* **Keep the initial scope small.** New abstractions should solve an actual current requirement.
* **Separate domain concepts from storage.** A `Document` represents a user's library entry; a `File` represents stored content.
* **Use the database for invariants.** PostgreSQL constraints should enforce relationships and data integrity where appropriate.
* **Keep business logic out of controllers.** Controllers handle HTTP concerns while services handle application logic and authorization.
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

import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    user_id: uuid().primaryKey().defaultRandom(),
    username: varchar({ length: 32 }).notNull().unique(),
    email: varchar({ length: 254 }).notNull().unique(),
    password_hash: text().notNull(),
    verified_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    last_login_at: timestamp({ withTimezone: true }),
  },
  (t) => [
    check(
      'users_username_length',
      sql`char_length(${t.username}) BETWEEN 3 AND 32`,
    ),
    index('idx_users_username_id').on(t.username),
  ],
);

export const files = pgTable(
  'files',
  {
    file_id: uuid().primaryKey().defaultRandom(),
    storage_key: text().notNull().unique(),
    mime_type: varchar({ length: 100 }).notNull(),
    size_bytes: bigint({ mode: 'number' }).notNull(),
    last_referenced_at: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('file_size_positive', sql`${t.size_bytes} > 0`),
    index('idx_files_last_referenced_at').on(t.last_referenced_at),
  ],
);

export const documents = pgTable(
  'documents',
  {
    doc_id: uuid().primaryKey().defaultRandom(),
    user_id: uuid()
      .notNull()
      .references(() => users.user_id, {
        name: 'documents_user_fk',
        onDelete: 'cascade',
      }),
    file_id: uuid()
      .notNull()
      .references(() => files.file_id, {
        name: 'documents_file_fk',
        onDelete: 'cascade',
      }),
    title: varchar({ length: 256 }).notNull(),
    author: varchar({ length: 256 }),
    publisher: varchar({ length: 256 }),
    description: text(),
    published_at: date(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    current_page: integer().notNull().default(0),
  },
  (t) => [
    check('documents_current_page_valid', sql`${t.current_page} >= 0`),
    check('documents_title_not_empty', sql`char_length(trim(${t.title})) > 0`),
    index('idx_documents_user_id').on(t.user_id),
    index('idx_documents_file_id').on(t.file_id),
  ],
);

export const shares = pgTable(
  'shares',
  {
    share_id: uuid().primaryKey().defaultRandom(),
    doc_id: uuid()
      .notNull()
      .references(() => documents.doc_id, {
        name: 'shares_document_fk',
        onDelete: 'cascade',
      }),
    token_hash: varchar({ length: 64 }).notNull().unique(),
    expires_at: timestamp({ withTimezone: true }),
    max_claims: integer(),
    claim_count: integer().notNull().default(0),
    revoked_at: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('shares_claim_count_valid', sql`${t.claim_count} >= 0`),
    check(
      'shares_max_claims_valid',
      sql`${t.max_claims} IS NULL OR ${t.max_claims} > 0`,
    ),
    check(
      'shares_claim_limit',
      sql`${t.max_claims} IS NULL OR ${t.claim_count} <= ${t.max_claims}`,
    ),
    check(
      'shares_expiration_valid',
      sql`${t.expires_at} IS NULL OR ${t.expires_at} > ${t.created_at}`,
    ),
    index('idx_shares_doc_id').on(t.doc_id),
  ],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    bookmark_id: uuid().primaryKey().defaultRandom(),
    doc_id: uuid()
      .notNull()
      .references(() => documents.doc_id, {
        name: 'bookmarks_document_fk',
        onDelete: 'cascade',
      }),
    page: integer().notNull(),
    content: text(),
    created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('bookmarks_page_valid', sql`${t.page} >= 1`),
    index('idx_bookmarks_doc_id').on(t.doc_id),
  ],
);

export const shareHistory = pgTable(
  'share_history',
  {
    user_id: uuid()
      .notNull()
      .references(() => users.user_id, {
        name: 'share_history_user_fk',
        onDelete: 'cascade',
      }),
    share_id: uuid()
      .notNull()
      .references(() => shares.share_id, {
        name: 'share_history_share_fk',
        onDelete: 'cascade',
      }),
    claimed_doc_id: uuid()
      .unique()
      .references(() => documents.doc_id, {
        name: 'share_history_claimed_doc_fk',
        onDelete: 'set null',
      }),
    claimed_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.share_id] }),
    index('idx_share_history_share_id').on(t.share_id),
  ],
);

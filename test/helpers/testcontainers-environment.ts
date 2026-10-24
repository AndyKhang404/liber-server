import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

let postgresContainer: StartedPostgreSqlContainer | null = null;
let s3Container: StartedTestContainer | null = null;
let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export interface TestEnvironment {
  postgresContainer: StartedPostgreSqlContainer;
  s3Container: StartedTestContainer;
  databaseUrl: string;
  s3Endpoint: string;
  pool: pg.Pool;
  db: ReturnType<typeof drizzle>;
}

export async function startTestEnvironment(): Promise<TestEnvironment> {
  if (postgresContainer && s3Container && pool && db) {
    return {
      postgresContainer,
      s3Container,
      databaseUrl: process.env.DATABASE_URL!,
      s3Endpoint: process.env.S3_ENDPOINT!,
      pool,
      db,
    };
  }

  // 1. Start PostgreSQL container
  postgresContainer = await new PostgreSqlContainer('postgres:18.6').start();
  const databaseUrl = `postgres://${postgresContainer.getUsername()}:${postgresContainer.getPassword()}@127.0.0.1:${postgresContainer.getPort()}/${postgresContainer.getDatabase()}`;

  // 2. Start S3 container (adobe/s3mock)
  s3Container = await new GenericContainer('adobe/s3mock:latest')
    .withExposedPorts(9090)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const s3Port = s3Container.getMappedPort(9090);
  const s3Endpoint = `http://127.0.0.1:${s3Port}`;

  // 3. Configure environment variables for NestJS application
  process.env.DATABASE_URL = databaseUrl;
  process.env.S3_ENDPOINT = s3Endpoint;
  process.env.S3_ACCESS_KEY = 'test_access_key';
  process.env.S3_SECRET_KEY = 'test_secret_key';
  process.env.S3_BUCKET = 'liber-books';
  process.env.S3_REGION = 'us-east-1';
  process.env.JWT_SECRET = 'super_secret_test_jwt_key_at_least_32_bytes_long';

  // 4. Run Drizzle schema migrations on PostgreSQL
  pool = new pg.Pool({ connectionString: databaseUrl });
  db = drizzle({ client: pool });

  const hasMigrations =
    existsSync('./drizzle') &&
    readdirSync('./drizzle').some((f) => !f.startsWith('.'));

  if (hasMigrations) {
    await migrate(db, { migrationsFolder: './drizzle' });
  } else {
    // In a fresh environment with no migrations folder yet, push schema directly
    execSync('npx drizzle-kit push --force', {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  }

  return {
    postgresContainer,
    s3Container,
    databaseUrl,
    s3Endpoint,
    pool,
    db,
  };
}

export async function cleanDatabase(): Promise<void> {
  if (db) {
    await db.execute(
      sql`TRUNCATE TABLE users, files, documents, shares, bookmarks, share_history CASCADE;`,
    );
  }
}

export async function stopTestEnvironment(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch {
      // ignore
    }
    pool = null;
    db = null;
  }

  const stopPromises: Promise<any>[] = [];
  if (postgresContainer) {
    stopPromises.push(postgresContainer.stop());
    postgresContainer = null;
  }
  if (s3Container) {
    stopPromises.push(s3Container.stop());
    s3Container = null;
  }

  await Promise.all(stopPromises);
}

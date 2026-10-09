import pg from "pg";
import { errorMessage } from "./command.js";
import { POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER } from "./constants.js";

/**
 * Postgres helpers for the integration harness.
 *
 * Step 03 creates NO Coderlix schema, tables, or migrations. The database
 * is only ever an empty throwaway database that tests may create objects
 * in; `resetDatabase` returns it to empty. Schema begins in a later step.
 */

export type PgClient = InstanceType<typeof pg.Client>;

export interface PostgresConnection {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  /** postgresql://user:password@host:port/database (throwaway credentials). */
  readonly connectionString: string;
}

export function buildConnection(port: number, database: string = POSTGRES_DB): PostgresConnection {
  const host = "127.0.0.1";
  return {
    host,
    port,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database,
    connectionString: `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(
      POSTGRES_PASSWORD,
    )}@${host}:${String(port)}/${encodeURIComponent(database)}`,
  };
}

/** Extracts the published host port from `docker compose port <svc> <port>` output. */
export function parseComposePortOutput(output: string): number {
  const firstLine = output.split("\n").find((line) => line.trim() !== "") ?? "";
  const match = /:(\d{1,5})\s*$/.exec(firstLine.trim());
  const port = match === null ? NaN : Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`could not parse a published port from \`docker compose port\` output: "${output.trim()}"`);
  }
  return port;
}

/** Quotes a SQL identifier after strictly validating it (identifiers here are harness-controlled). */
export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to use unsafe SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

export interface ConnectOptions {
  /** Connect to this database instead of `connection.database`. */
  database?: string;
  /** Keep retrying for this long before giving up. Default 30s. */
  timeoutMs?: number;
}

/** Connects (with bounded retry) and returns a ready client. The caller must `end()` it. */
export async function connectPostgres(
  connection: PostgresConnection,
  options: ConnectOptions = {},
): Promise<PgClient> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let lastError: unknown;
  for (;;) {
    const client = new pg.Client({
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      database: options.database ?? connection.database,
      connectionTimeoutMillis: 5_000,
    });
    client.on("error", (error: Error) => {
      lastError = error;
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {
        // connection never established; nothing to close
      });
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `PostgreSQL at ${connection.host}:${String(connection.port)} was not reachable: ${errorMessage(lastError)}`,
        { cause: lastError },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Lists every user-created object that makes a database non-empty:
 * relations (tables/indexes/sequences/views/...), extra schemas, non-default
 * extensions, user types (enum/domain/range), and user functions.
 * An empty array means the database is pristine.
 */
export async function describeDatabaseObjects(client: PgClient): Promise<string[]> {
  const found: string[] = [];

  const relations = await client.query<{ schema: string; name: string; kind: string }>(
    `SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      ORDER BY 1, 2`,
  );
  for (const row of relations.rows) found.push(`relation ${row.schema}.${row.name} (relkind ${row.kind})`);

  const schemas = await client.query<{ name: string }>(
    `SELECT nspname AS name FROM pg_namespace
      WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'public')
      ORDER BY 1`,
  );
  for (const row of schemas.rows) found.push(`schema ${row.name}`);

  const extensions = await client.query<{ name: string }>(
    `SELECT extname AS name FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1`,
  );
  for (const row of extensions.rows) found.push(`extension ${row.name}`);

  const types = await client.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, t.typname AS name
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
        AND t.typtype IN ('e', 'd', 'r', 'm')
      ORDER BY 1, 2`,
  );
  for (const row of types.rows) found.push(`type ${row.schema}.${row.name}`);

  const functions = await client.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, p.proname AS name
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      ORDER BY 1, 2`,
  );
  for (const row of functions.rows) found.push(`function ${row.schema}.${row.name}`);

  return found;
}

/** Throws unless the database is pristine (see describeDatabaseObjects). */
export async function assertDatabaseEmpty(connection: PostgresConnection): Promise<void> {
  const client = await connectPostgres(connection);
  try {
    const objects = await describeDatabaseObjects(client);
    if (objects.length > 0) {
      throw new Error(
        `database "${connection.database}" is not empty after reset:\n  ${objects.slice(0, 20).join("\n  ")}`,
      );
    }
  } finally {
    await client.end().catch(() => {
      // already closed
    });
  }
}

/**
 * Deterministically returns the test database to a pristine, EMPTY state by
 * dropping it (terminating any open sessions with `WITH (FORCE)`, PostgreSQL
 * 13+) and recreating it from `template0`, then verifying emptiness.
 *
 * Any pool/client the caller holds on this database is terminated by the
 * drop and must be recreated afterwards.
 */
export async function resetDatabase(connection: PostgresConnection): Promise<void> {
  const database = quoteIdent(connection.database);
  const admin = await connectPostgres(connection, { database: "postgres" });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);
  } finally {
    await admin.end().catch(() => {
      // already closed
    });
  }
  await assertDatabaseEmpty(connection);
}

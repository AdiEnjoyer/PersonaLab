import type { Transaction } from 'dexie';

/** The App's declared Local_Database schema version. Must equal the last migration's version (or 1). */
export const DB_VERSION = 1;

export interface DbMigration {
  /** 2, 3, … in ascending order without gaps. */
  version: number;
  /** Dexie store delta; `null` deletes a table. */
  stores?: Record<string, string | null>;
  /** Content upgrade; runs inside the single all-or-nothing `versionchange` transaction (R3.3). */
  upgrade?: (tx: Transaction) => Promise<void>;
  /** Documentation of the records this migration deletes (R3.3). */
  deletes?: string[];
  /** Module data version per module at this database version (used by the emergency export, R3.4). */
  moduleDataVersions: Record<string, number>;
}

/** Version 1 has no migration. */
export const MIGRATIONS: DbMigration[] = [];

/** Module data versions stored by database version 1. */
export const MODULE_DATA_VERSIONS_V1: Record<string, number> = { gym: 1, nutrition: 1, chess: 1 };

/** The version a migration list declares: the last migration's version, or 1 when there is none. */
export function declaredVersion(migrations: readonly DbMigration[]): number {
  return migrations.at(-1)?.version ?? 1;
}

/** Throws unless the migrations are numbered 2, 3, … in order, without gaps or repeats. */
export function assertMigrationOrder(migrations: readonly DbMigration[]): void {
  migrations.forEach((migration, i) => {
    if (migration.version !== i + 2) {
      throw new Error(`Migration ${i + 1} declares version ${migration.version}; expected ${i + 2}`);
    }
  });
}

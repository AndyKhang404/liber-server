import { randomUUID } from 'crypto';
import { documents, files, users } from '../../src/db/schema.js';

export interface InMemoryDbState {
  users: Array<Record<string, any>>;
  files: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
}

function getTableName(table: any): string {
  if (table === users) return 'users';
  if (table === files) return 'files';
  if (table === documents) return 'documents';
  if (table && typeof table === 'object') {
    for (const sym of Object.getOwnPropertySymbols(table)) {
      if (sym.toString().includes('drizzle:Name')) {
        return table[sym];
      }
    }
  }
  return '';
}

export function createMockDb(initialState?: Partial<InMemoryDbState>) {
  let state: InMemoryDbState = {
    users: [...(initialState?.users || [])],
    files: [...(initialState?.files || [])],
    documents: [...(initialState?.documents || [])],
  };

  const createQueryClient = (clientState: InMemoryDbState) => {
    return {
      select: (selection?: any) => ({
        from: (table: any) => ({
          where: (whereClause?: any) => {
            const execute = () => {
              const tableName = getTableName(table);
              const rows =
                tableName === 'users'
                  ? clientState.users
                  : tableName === 'files'
                    ? clientState.files
                    : clientState.documents;

              let result = [...rows];
              if (whereClause) {
                result = result.filter((row) => matchesWhere(row, whereClause));
              }

              if (selection && typeof selection === 'object') {
                return result.map((r) => mapSelection(r, selection));
              }
              return result;
            };

            const promise = Promise.resolve().then(() => execute());
            (promise as any).limit = (n: number) =>
              Promise.resolve().then(() => execute().slice(0, n));

            return promise;
          },
        }),
      }),

      insert: (table: any) => ({
        values: (val: any) => {
          const insertRow = () => {
            const tableName = getTableName(table);
            const idField =
              tableName === 'users'
                ? 'user_id'
                : tableName === 'files'
                  ? 'file_id'
                  : 'doc_id';

            const newRow = {
              [idField]: val[idField] || randomUUID(),
              created_at: new Date(),
              ...val,
            };

            if (tableName === 'users') clientState.users.push(newRow);
            else if (tableName === 'files') clientState.files.push(newRow);
            else if (tableName === 'documents') clientState.documents.push(newRow);

            return newRow;
          };

          return {
            returning: (fields?: any) => {
              const row = insertRow();
              if (fields) {
                const mapped: any = {};
                for (const k of Object.keys(fields)) {
                  const colName = fields[k]?.name || k;
                  mapped[k] = row[colName] ?? row[k];
                }
                return Promise.resolve([mapped]);
              }
              return Promise.resolve([row]);
            },
          };
        },
      }),

      update: (table: any) => ({
        set: (setData: any) => ({
          where: (whereClause: any) => {
            const execute = (returnData: boolean) => {
              const tableName = getTableName(table);
              const rows =
                tableName === 'users'
                  ? clientState.users
                  : tableName === 'files'
                    ? clientState.files
                    : clientState.documents;

              const updatedRows: any[] = [];
              const newRows = rows.map((row) => {
                if (matchesWhere(row, whereClause)) {
                  const updated = { ...row, ...setData };
                  updatedRows.push(updated);
                  return updated;
                }
                return row;
              });

              if (tableName === 'users') clientState.users = newRows;
              else if (tableName === 'files') clientState.files = newRows;
              else if (tableName === 'documents') clientState.documents = newRows;

              return returnData ? updatedRows : undefined;
            };

            const promise = Promise.resolve().then(() => execute(false));
            (promise as any).returning = (_fields?: any) =>
              Promise.resolve().then(() => execute(true));

            return promise;
          },
        }),
      }),

      delete: (table: any) => ({
        where: (whereClause: any) => {
          const tableName = getTableName(table);
          const rows =
            tableName === 'users'
              ? clientState.users
              : tableName === 'files'
                ? clientState.files
                : clientState.documents;

          const remaining = rows.filter(
            (row) => !matchesWhere(row, whereClause),
          );

          if (tableName === 'users') clientState.users = remaining;
          else if (tableName === 'files') clientState.files = remaining;
          else if (tableName === 'documents') clientState.documents = remaining;

          return Promise.resolve();
        },
      }),

      transaction: async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
        const snapshot: InMemoryDbState = {
          users: clientState.users.map((u) => ({ ...u })),
          files: clientState.files.map((f) => ({ ...f })),
          documents: clientState.documents.map((d) => ({ ...d })),
        };

        const txClient = createQueryClient(clientState);
        try {
          return await callback(txClient);
        } catch (error) {
          clientState.users = snapshot.users;
          clientState.files = snapshot.files;
          clientState.documents = snapshot.documents;
          throw error;
        }
      },
    };
  };

  function matchesWhere(row: any, whereClause: any): boolean {
    if (!whereClause) return true;

    if (typeof whereClause.toQuery === 'function') {
      try {
        const { sql, params } = whereClause.toQuery({
          escapeName: (s: string) => s,
          escapeParam: () => '?',
        });

        const regex = /(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*=\s*\?/g;
        const matches = [...sql.matchAll(regex)];

        if (matches.length > 0) {
          return matches.every((match, idx) => {
            const col = match[2];
            const param = params[idx];
            return String(row[col]) === String(param);
          });
        }
      } catch {
        // Fall back
      }
    }

    return true;
  }

  function mapSelection(row: any, selection: any) {
    const result: any = {};
    for (const key of Object.keys(selection)) {
      const col = selection[key];
      const colName = col?.name || key;
      result[key] = row[colName] ?? row[key];
    }
    return result;
  }

  const rootClient = createQueryClient(state);

  return {
    db: rootClient,
    getState: () => state,
    reset: (newState?: Partial<InMemoryDbState>) => {
      state.users.length = 0;
      state.files.length = 0;
      state.documents.length = 0;
      if (newState?.users) state.users.push(...newState.users);
      if (newState?.files) state.files.push(...newState.files);
      if (newState?.documents) state.documents.push(...newState.documents);
    },
  };
}

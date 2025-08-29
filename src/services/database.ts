import * as sqlite3 from 'sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const DATA_DIR = path.join(os.homedir(), '.clockify-auto-cli');
const DB_FILE = path.join(DATA_DIR, 'clockify.db');

export class DatabaseService {
  private db: sqlite3.Database | null = null;

  async initialize(): Promise<void> {
    await fs.ensureDir(DATA_DIR);
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.runMigrations()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const migrations = [
      // Initial schema
      `CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_date TEXT NOT NULL,
        project TEXT NOT NULL,
        description TEXT NOT NULL,
        end_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Create index on start_date for faster queries
      `CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date)`,
      
      // Create index on date range queries
      `CREATE INDEX IF NOT EXISTS idx_tasks_date_range ON tasks(start_date, end_date)`,
      
      // Time entries tracking table
      `CREATE TABLE IF NOT EXISTS time_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clockify_id TEXT UNIQUE,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date)`,
      `CREATE INDEX IF NOT EXISTS idx_time_entries_clockify_id ON time_entries(clockify_id)`,
      
      // Schema version table for future migrations
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Insert initial schema version
      `INSERT OR IGNORE INTO schema_version (version) VALUES (1)`
    ];

    for (const migration of migrations) {
      await this.run(migration);
    }
  }

  async run(query: string, params: any[] = []): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db!.run(query, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async get<T = any>(query: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db!.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  async all<T = any>(query: string, params: any[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db!.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async getLastInsertId(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.get<{ id: number }>('SELECT last_insert_rowid() as id');
    return result?.id || 0;
  }

  getDatabasePath(): string {
    return DB_FILE;
  }
}
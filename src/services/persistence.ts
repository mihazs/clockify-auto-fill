import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import dayjs from 'dayjs';
import { DatabaseService } from './database';

export interface TaskEntry {
  id?: number;
  startDate: string;
  project: string;
  description: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TimeEntryRecord {
  id?: number;
  clockifyId?: string;
  date: string;
  description: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  projectId: string;
  workspaceId: string;
  createdAt?: string;
}

export class PersistenceService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  // Task management methods
  async addTask(task: Omit<TaskEntry, 'id' | 'endDate' | 'createdAt' | 'updatedAt'>): Promise<number> {
    // Check if a task already exists for this start date
    const existing = await this.db.get<TaskEntry>(
      'SELECT * FROM tasks WHERE start_date = ?',
      [task.startDate]
    );

    if (existing) {
      // Update existing task
      await this.db.run(
        'UPDATE tasks SET project = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE start_date = ?',
        [task.project, task.description, task.startDate]
      );
      return existing.id!;
    } else {
      // Insert new task
      await this.db.run(
        'INSERT INTO tasks (start_date, project, description) VALUES (?, ?, ?)',
        [task.startDate, task.project, task.description]
      );
      return await this.db.getLastInsertId();
    }
  }

  async getTasks(): Promise<TaskEntry[]> {
    const tasks = await this.db.all<any>(
      `SELECT 
        id,
        start_date as startDate,
        project,
        description,
        end_date as endDate,
        created_at as createdAt,
        updated_at as updatedAt
      FROM tasks 
      ORDER BY start_date ASC`
    );

    return this.calculateEndDates(tasks);
  }

  async getTaskForDate(date: string): Promise<TaskEntry | null> {
    // First, get all tasks to calculate end dates properly
    const allTasks = await this.getTasks();
    
    return allTasks.find(task => {
      const taskStart = dayjs(task.startDate);
      const taskEnd = task.endDate ? dayjs(task.endDate) : dayjs();
      const targetDate = dayjs(date);
      
      return targetDate.isSame(taskStart, 'day') || 
             (targetDate.isAfter(taskStart, 'day') && targetDate.isBefore(taskEnd, 'day')) ||
             (targetDate.isSame(taskEnd, 'day'));
    }) || null;
  }

  async getCurrentTask(): Promise<TaskEntry | null> {
    const today = dayjs().format('YYYY-MM-DD');
    return this.getTaskForDate(today);
  }

  async getTasksInDateRange(startDate: string, endDate: string): Promise<TaskEntry[]> {
    const allTasks = await this.getTasks();
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    
    return allTasks.filter(task => {
      const taskStart = dayjs(task.startDate);
      const taskEnd = task.endDate ? dayjs(task.endDate) : dayjs();
      
      // Task overlaps with the date range
      return (taskStart.isBefore(end, 'day') || taskStart.isSame(end, 'day')) &&
             (taskEnd.isAfter(start, 'day') || taskEnd.isSame(start, 'day'));
    });
  }

  async deleteTask(startDate: string): Promise<void> {
    await this.db.run('DELETE FROM tasks WHERE start_date = ?', [startDate]);
  }

  async deleteTaskById(id: number): Promise<void> {
    await this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
  }

  // Time entry tracking methods
  async addTimeEntry(entry: Omit<TimeEntryRecord, 'id' | 'createdAt'>): Promise<number> {
    await this.db.run(
      `INSERT INTO time_entries 
       (clockify_id, date, description, start_time, end_time, duration_minutes, project_id, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.clockifyId || null,
        entry.date,
        entry.description,
        entry.startTime,
        entry.endTime,
        entry.durationMinutes,
        entry.projectId,
        entry.workspaceId
      ]
    );
    return await this.db.getLastInsertId();
  }

  async getTimeEntriesForDate(date: string): Promise<TimeEntryRecord[]> {
    return await this.db.all<any>(
      `SELECT 
        id,
        clockify_id as clockifyId,
        date,
        description,
        start_time as startTime,
        end_time as endTime,
        duration_minutes as durationMinutes,
        project_id as projectId,
        workspace_id as workspaceId,
        created_at as createdAt
      FROM time_entries 
      WHERE date = ?
      ORDER BY start_time ASC`,
      [date]
    );
  }

  async getTimeEntriesInRange(startDate: string, endDate: string): Promise<TimeEntryRecord[]> {
    return await this.db.all<any>(
      `SELECT 
        id,
        clockify_id as clockifyId,
        date,
        description,
        start_time as startTime,
        end_time as endTime,
        duration_minutes as durationMinutes,
        project_id as projectId,
        workspace_id as workspaceId,
        created_at as createdAt
      FROM time_entries 
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC, start_time ASC`,
      [startDate, endDate]
    );
  }

  async hasTimeEntryForDate(date: string): Promise<boolean> {
    const entry = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM time_entries WHERE date = ?',
      [date]
    );
    return (entry?.count || 0) > 0;
  }

  async updateTimeEntryClockifyId(localId: number, clockifyId: string): Promise<void> {
    await this.db.run(
      'UPDATE time_entries SET clockify_id = ? WHERE id = ?',
      [clockifyId, localId]
    );
  }

  async deleteTimeEntry(clockifyId: string): Promise<void> {
    await this.db.run('DELETE FROM time_entries WHERE clockify_id = ?', [clockifyId]);
  }

  // Utility methods
  private calculateEndDates(tasks: TaskEntry[]): TaskEntry[] {
    const sortedTasks = [...tasks].sort((a, b) => 
      dayjs(a.startDate).diff(dayjs(b.startDate))
    );

    return sortedTasks.map((task, index) => {
      if (index < sortedTasks.length - 1) {
        const nextTask = sortedTasks[index + 1];
        task.endDate = dayjs(nextTask.startDate).subtract(1, 'day').format('YYYY-MM-DD');
      } else {
        task.endDate = dayjs().format('YYYY-MM-DD');
      }
      return task;
    });
  }

  // Migration utility - import from CSV if it exists
  async migrateFromCSV(): Promise<void> {
    const oldCsvPath = path.join(os.homedir(), '.clockify-auto-cli', 'tasks.csv');
    
    if (!await fs.pathExists(oldCsvPath)) {
      return; // No CSV to migrate
    }

    try {
      // Check if we already have tasks in the database
      const existingTasks = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasks'
      );
      
      if ((existingTasks?.count || 0) > 0) {
        return; // Already migrated
      }

      console.log('Migrating tasks from CSV to SQLite...');

      const csv = require('csv-parser');
      const tasks: any[] = [];

      await new Promise((resolve, reject) => {
        fs.createReadStream(oldCsvPath)
          .pipe(csv({
            separator: ';',
            headers: ['startDate', 'project', 'description']
          }))
          .on('data', (data: any) => {
            if (data.startDate && data.startDate !== 'start_date') {
              tasks.push({
                startDate: data.startDate,
                project: data.project || '',
                description: data.description || ''
              });
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      for (const task of tasks) {
        await this.addTask(task);
      }

      console.log(`Migrated ${tasks.length} tasks from CSV to SQLite`);

      // Rename the old CSV file as backup
      await fs.move(oldCsvPath, `${oldCsvPath}.backup`);
      console.log('CSV file backed up as tasks.csv.backup');

    } catch (error) {
      console.error('Error migrating from CSV:', error);
    }
  }

  getDatabasePath(): string {
    return this.db.getDatabasePath();
  }

  // Legacy compatibility methods (for backward compatibility)
  async readTasks(): Promise<TaskEntry[]> {
    return this.getTasks();
  }

  async writeTasks(tasks: TaskEntry[]): Promise<void> {
    // Clear existing tasks and insert new ones
    await this.db.run('DELETE FROM tasks');
    
    for (const task of tasks) {
      await this.addTask(task);
    }
  }

  getTasksFilePath(): string {
    return this.getDatabasePath();
  }
}
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { PersistenceService, TaskEntry, TimeEntryRecord } from '../src/services/persistence';
import { DatabaseService } from '../src/services/database';

jest.mock('fs-extra');
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home')
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('PersistenceService', () => {
  let persistenceService: PersistenceService;
  const mockDataDir = '/mock/home/.clockify-auto-cli';
  const mockDbFile = '/mock/home/.clockify-auto-cli/clockify.db';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock/home');
    (mockFs.ensureDir as jest.Mock).mockResolvedValue(undefined);
    
    persistenceService = new PersistenceService();
    
    // Mock the database with in-memory SQLite
    (persistenceService as any).db = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      all: jest.fn(),
      getLastInsertId: jest.fn().mockResolvedValue(1),
      getDatabasePath: jest.fn().mockReturnValue(mockDbFile)
    };
    
    await persistenceService.initialize();
  });

  afterEach(async () => {
    await persistenceService.close();
  });

  describe('Task Management', () => {
    describe('addTask', () => {
      it('should add a new task', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.get.mockResolvedValue(undefined); // No existing task
        mockDb.getLastInsertId.mockResolvedValue(1);

        const result = await persistenceService.addTask({
          startDate: '2025-01-01',
          project: 'Project A',
          description: 'Task 1'
        });

        expect(result).toBe(1);
        expect(mockDb.run).toHaveBeenCalledWith(
          'INSERT INTO tasks (start_date, project, description) VALUES (?, ?, ?)',
          ['2025-01-01', 'Project A', 'Task 1']
        );
      });

      it('should update existing task', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.get.mockResolvedValue({ id: 1, start_date: '2025-01-01' });

        const result = await persistenceService.addTask({
          startDate: '2025-01-01',
          project: 'Updated Project',
          description: 'Updated Task'
        });

        expect(result).toBe(1);
        expect(mockDb.run).toHaveBeenCalledWith(
          'UPDATE tasks SET project = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE start_date = ?',
          ['Updated Project', 'Updated Task', '2025-01-01']
        );
      });
    });

    describe('getTasks', () => {
      it('should return all tasks with calculated end dates', async () => {
        const mockDb = (persistenceService as any).db;
        const mockTasks = [
          {
            id: 1,
            startDate: '2025-01-01',
            project: 'Project A',
            description: 'Task 1'
          },
          {
            id: 2,
            startDate: '2025-01-05',
            project: 'Project B',
            description: 'Task 2'
          }
        ];

        mockDb.all.mockResolvedValue(mockTasks);

        const tasks = await persistenceService.getTasks();

        expect(tasks).toHaveLength(2);
        expect(tasks[0].endDate).toBe('2025-01-04'); // Day before next task
        expect(tasks[1].endDate).toBeTruthy(); // Current date
      });
    });

    describe('getTaskForDate', () => {
      it('should return task for given date', async () => {
        const mockDb = (persistenceService as any).db;
        const mockTasks = [
          {
            id: 1,
            startDate: '2025-01-01',
            project: 'Project A',
            description: 'Task 1'
          }
        ];

        mockDb.all.mockResolvedValue(mockTasks);

        const task = await persistenceService.getTaskForDate('2025-01-01');

        expect(task).toBeTruthy();
        expect(task?.description).toBe('Task 1');
      });

      it('should return null if no task found', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.all.mockResolvedValue([]);

        const task = await persistenceService.getTaskForDate('2025-01-01');

        expect(task).toBeNull();
      });
    });

    describe('deleteTask', () => {
      it('should delete task by start date', async () => {
        const mockDb = (persistenceService as any).db;

        await persistenceService.deleteTask('2025-01-01');

        expect(mockDb.run).toHaveBeenCalledWith(
          'DELETE FROM tasks WHERE start_date = ?',
          ['2025-01-01']
        );
      });
    });
  });

  describe('Time Entry Management', () => {
    describe('addTimeEntry', () => {
      it('should add a new time entry', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.getLastInsertId.mockResolvedValue(1);

        const entry: Omit<TimeEntryRecord, 'id' | 'createdAt'> = {
          clockifyId: 'clockify-123',
          date: '2025-01-01',
          description: 'Work task',
          startTime: '09:00:00',
          endTime: '17:00:00',
          durationMinutes: 480,
          projectId: 'proj-123',
          workspaceId: 'ws-123'
        };

        const result = await persistenceService.addTimeEntry(entry);

        expect(result).toBe(1);
        expect(mockDb.run).toHaveBeenCalledWith(
          `INSERT INTO time_entries 
       (clockify_id, date, description, start_time, end_time, duration_minutes, project_id, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['clockify-123', '2025-01-01', 'Work task', '09:00:00', '17:00:00', 480, 'proj-123', 'ws-123']
        );
      });
    });

    describe('getTimeEntriesForDate', () => {
      it('should return time entries for a date', async () => {
        const mockDb = (persistenceService as any).db;
        const mockEntries = [
          {
            id: 1,
            clockifyId: 'clockify-123',
            date: '2025-01-01',
            description: 'Work task',
            startTime: '09:00:00',
            endTime: '17:00:00',
            durationMinutes: 480,
            projectId: 'proj-123',
            workspaceId: 'ws-123'
          }
        ];

        mockDb.all.mockResolvedValue(mockEntries);

        const entries = await persistenceService.getTimeEntriesForDate('2025-01-01');

        expect(entries).toEqual(mockEntries);
        expect(mockDb.all).toHaveBeenCalledWith(
          expect.stringContaining('FROM time_entries'),
          ['2025-01-01']
        );
      });
    });

    describe('hasTimeEntryForDate', () => {
      it('should return true if entries exist', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.get.mockResolvedValue({ count: 1 });

        const result = await persistenceService.hasTimeEntryForDate('2025-01-01');

        expect(result).toBe(true);
      });

      it('should return false if no entries exist', async () => {
        const mockDb = (persistenceService as any).db;
        mockDb.get.mockResolvedValue({ count: 0 });

        const result = await persistenceService.hasTimeEntryForDate('2025-01-01');

        expect(result).toBe(false);
      });
    });
  });

  describe('Migration', () => {
    describe('migrateFromCSV', () => {
      it('should skip migration if no CSV exists', async () => {
        (mockFs.pathExists as jest.Mock).mockResolvedValue(false);

        await persistenceService.migrateFromCSV();

        // Should not attempt to read CSV
        expect(mockFs.createReadStream).not.toHaveBeenCalled();
      });

      it('should skip migration if tasks already exist', async () => {
        const mockDb = (persistenceService as any).db;
        (mockFs.pathExists as jest.Mock).mockResolvedValue(true);
        mockDb.get.mockResolvedValue({ count: 1 });

        await persistenceService.migrateFromCSV();

        // Should not attempt to read CSV
        expect(mockFs.createReadStream).not.toHaveBeenCalled();
      });
    });
  });

  describe('Utility Methods', () => {
    it('should return database path', () => {
      const path = persistenceService.getDatabasePath();
      expect(path).toBe(mockDbFile);
    });

    it('should maintain backward compatibility with legacy methods', async () => {
      const mockDb = (persistenceService as any).db;
      mockDb.all.mockResolvedValue([]);

      const tasks = await persistenceService.readTasks();
      expect(tasks).toEqual([]);

      const filePath = persistenceService.getTasksFilePath();
      expect(filePath).toBe(mockDbFile);
    });
  });
});
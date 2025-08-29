import axios from 'axios';
import { ClockifyService } from '../src/services/clockify';
import { Config } from '../src/commands/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ClockifyService', () => {
  let clockifyService: ClockifyService;
  let config: Config;

  beforeEach(() => {
    config = {
      clockifyApiKey: 'test-api-key',
      workspaceId: 'workspace-123',
      projectId: 'project-456'
    };
    clockifyService = new ClockifyService(config);
    
    // Mock the user endpoint that's called to get user ID
    mockedAxios.get.mockImplementation((url) => {
      if (url.endsWith('/user')) {
        return Promise.resolve({
          data: { id: 'user-123', name: 'Test User', email: 'test@example.com' }
        });
      }
      return Promise.reject(new Error('Unexpected request'));
    });
  });

  describe('constructor', () => {
    it('should throw error if configuration is incomplete', () => {
      expect(() => new ClockifyService({})).toThrow('Clockify configuration is incomplete');
      expect(() => new ClockifyService({ clockifyApiKey: 'key' })).toThrow('Clockify configuration is incomplete');
    });
  });

  describe('addTimeEntry', () => {
    it('should successfully add a time entry', async () => {
      const mockResponse = {
        data: {
          id: 'entry-123',
          description: 'Test task',
          timeInterval: {
            start: '2025-01-06T09:00:00Z',
            end: '2025-01-06T17:00:00Z',
            duration: 'PT8H'
          }
        }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const entry = {
        description: 'Test task',
        start: '2025-01-06T09:00:00Z',
        end: '2025-01-06T17:00:00Z'
      };

      const result = await clockifyService.addTimeEntry(entry);

      expect(result).toEqual(mockResponse.data);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.clockify.me/api/v1/workspaces/workspace-123/user/user-123/time-entries',
        {
          description: 'Test task',
          start: '2025-01-06T09:00:00Z',
          end: '2025-01-06T17:00:00Z',
          projectId: 'project-456',
          billable: false
        },
        {
          headers: {
            'X-Api-Key': 'test-api-key',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should handle authentication errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 }
      };
      
      // Override the user endpoint mock to return 401
      mockedAxios.get.mockImplementation((url) => {
        if (url.endsWith('/user')) {
          return Promise.reject(axiosError);
        }
        return Promise.reject(new Error('Unexpected request'));
      });
      
      mockedAxios.isAxiosError.mockReturnValue(true);

      const entry = {
        description: 'Test task',
        start: '2025-01-06T09:00:00Z',
        end: '2025-01-06T17:00:00Z'
      };

      await expect(clockifyService.addTimeEntry(entry)).rejects.toThrow('Clockify authentication failed');
    });
  });

  describe('getTimeEntriesForDate', () => {
    it('should fetch time entries for a specific date', async () => {
      const mockResponse = {
        data: [{
          id: 'entry-123',
          description: 'Test task',
          timeInterval: {
            start: '2025-01-06T09:00:00Z',
            end: '2025-01-06T17:00:00Z',
            duration: 'PT8H'
          }
        }]
      };

      // Override the get mock to handle both /user and time-entries calls
      mockedAxios.get.mockImplementation((url) => {
        if (url.endsWith('/user')) {
          return Promise.resolve({
            data: { id: 'user-123', name: 'Test User', email: 'test@example.com' }
          });
        }
        if (url.includes('time-entries')) {
          return Promise.resolve(mockResponse);
        }
        return Promise.reject(new Error('Unexpected request'));
      });

      const result = await clockifyService.getTimeEntriesForDate('2025-01-06');

      expect(result).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.clockify.me/api/v1/workspaces/workspace-123/user/user-123/time-entries',
        expect.objectContaining({
          headers: {
            'X-Api-Key': 'test-api-key',
            'Content-Type': 'application/json'
          },
          params: expect.objectContaining({
            'page-size': 50
          })
        })
      );
    });
  });

  describe('hasEntryForDate', () => {
    it('should return true if entries exist for date', async () => {
      mockedAxios.get.mockImplementation((url) => {
        if (url.endsWith('/user')) {
          return Promise.resolve({
            data: { id: 'user-123', name: 'Test User', email: 'test@example.com' }
          });
        }
        if (url.includes('time-entries')) {
          return Promise.resolve({ data: [{ id: 'entry-123' }] });
        }
        return Promise.reject(new Error('Unexpected request'));
      });

      const result = await clockifyService.hasEntryForDate('2025-01-06');

      expect(result).toBe(true);
    });

    it('should return false if no entries exist for date', async () => {
      mockedAxios.get.mockImplementation((url) => {
        if (url.endsWith('/user')) {
          return Promise.resolve({
            data: { id: 'user-123', name: 'Test User', email: 'test@example.com' }
          });
        }
        if (url.includes('time-entries')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.reject(new Error('Unexpected request'));
      });

      const result = await clockifyService.hasEntryForDate('2025-01-06');

      expect(result).toBe(false);
    });
  });

  describe('createTimeEntry', () => {
    it('should create time entry with correct format', () => {
      const entry = clockifyService.createTimeEntry('2025-01-06', 'Test task');

      expect(entry.description).toBe('Test task');
      expect(entry.billable).toBe(false);
      expect(entry.start).toContain('2025-01-06');
      expect(entry.end).toContain('2025-01-06');
      // Check that end is after start
      expect(new Date(entry.end!).getTime()).toBeGreaterThan(new Date(entry.start).getTime());
    });

    it('should create time entry with custom hours', () => {
      const entry = clockifyService.createTimeEntry('2025-01-06', 'Test task', '08:00', '16:00');

      expect(entry.description).toBe('Test task');
      expect(entry.billable).toBe(false);
      expect(entry.start).toContain('2025-01-06');
      expect(entry.end).toContain('2025-01-06');
      // Check that end is after start
      expect(new Date(entry.end!).getTime()).toBeGreaterThan(new Date(entry.start).getTime());
    });
  });
});
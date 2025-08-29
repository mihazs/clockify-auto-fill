import axios from 'axios';
import { JiraService } from '../src/services/jira';
import { Config } from '../src/commands/config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JiraService', () => {
  let jiraService: JiraService;
  let config: Config;

  beforeEach(() => {
    config = {
      jiraBaseUrl: 'https://company.atlassian.net',
      jiraEmail: 'user@company.com',
      jiraApiKey: 'test-api-key'
    };
    jiraService = new JiraService(config);
  });

  describe('constructor', () => {
    it('should throw error if configuration is incomplete', () => {
      expect(() => new JiraService({})).toThrow('Jira configuration is incomplete');
      expect(() => new JiraService({ jiraBaseUrl: 'url' })).toThrow('Jira configuration is incomplete');
    });
  });

  describe('getCurrentTasks', () => {
    it('should fetch current tasks successfully', async () => {
      const mockResponse = {
        data: {
          issues: [
            {
              key: 'PROJ-123',
              fields: {
                summary: 'Fix login bug',
                description: 'User cannot login',
                status: { name: 'In Progress' }
              }
            },
            {
              key: 'PROJ-124',
              fields: {
                summary: 'Add new feature',
                description: null,
                status: { name: 'To Do' }
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await jiraService.getCurrentTasks();

      expect(result).toEqual([
        {
          key: 'PROJ-123',
          summary: 'Fix login bug',
          description: 'User cannot login',
          status: 'In Progress'
        },
        {
          key: 'PROJ-124',
          summary: 'Add new feature',
          description: null,
          status: 'To Do'
        }
      ]);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://company.atlassian.net/rest/api/3/search/jql',
        {
          headers: {
            'Authorization': `Basic ${Buffer.from('user@company.com:test-api-key').toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          params: {
            jql: 'assignee = currentUser() AND status != "Done" ORDER BY updated DESC',
            fields: 'key,summary,description,status',
            maxResults: 50
          }
        }
      );
    });

    it('should handle authentication errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401 }
      };
      
      mockedAxios.get.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(jiraService.getCurrentTasks()).rejects.toThrow('Jira authentication failed');
    });

    it('should handle not found errors', async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 }
      };
      
      mockedAxios.get.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(jiraService.getCurrentTasks()).rejects.toThrow('Jira API endpoint not found');
    });
  });

  describe('getTaskDescription', () => {
    it('should fetch task description successfully', async () => {
      const mockResponse = {
        data: {
          fields: {
            summary: 'Fix login bug',
            description: 'User cannot login with valid credentials'
          }
        }
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await jiraService.getTaskDescription('PROJ-123');

      expect(result).toBe('Fix login bug: User cannot login with valid credentials');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://company.atlassian.net/rest/api/3/issue/PROJ-123',
        {
          headers: {
            'Authorization': `Basic ${Buffer.from('user@company.com:test-api-key').toString('base64')}`,
            'Accept': 'application/json'
          },
          params: {
            fields: 'summary,description'
          }
        }
      );
    });

    it('should return only summary if no description', async () => {
      const mockResponse = {
        data: {
          fields: {
            summary: 'Fix login bug',
            description: null
          }
        }
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await jiraService.getTaskDescription('PROJ-123');

      expect(result).toBe('Fix login bug');
    });

    it('should return fallback on error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await jiraService.getTaskDescription('PROJ-123');

      expect(result).toBe('Task PROJ-123');
    });
  });

  describe('formatTasksForClockify', () => {
    it('should format tasks for Clockify', () => {
      const tasks = [
        {
          key: 'PROJ-123',
          summary: 'Fix login bug',
          description: 'User cannot login with valid credentials',
          status: 'In Progress'
        },
        {
          key: 'PROJ-124',
          summary: 'Add new feature',
          description: undefined,
          status: 'To Do'
        }
      ];

      const result = jiraService.formatTasksForClockify(tasks);

      expect(result).toEqual([
        'PROJ-123: Fix login bug - User cannot login with valid credentials...',
        'PROJ-124: Add new feature'
      ]);
    });

    it('should handle long descriptions', () => {
      const tasks = [
        {
          key: 'PROJ-123',
          summary: 'Fix bug',
          description: 'A'.repeat(150),
          status: 'In Progress'
        }
      ];

      const result = jiraService.formatTasksForClockify(tasks);

      expect(result[0]).toContain('...');
      expect(result[0].length).toBeLessThan(200);
    });

    it('should remove problematic characters', () => {
      const tasks = [
        {
          key: 'PROJ-123',
          summary: 'Fix; bug, with\nnewlines\rand returns',
          description: 'Description; with, problematic\ncharacters\r',
          status: 'In Progress'
        }
      ];

      const result = jiraService.formatTasksForClockify(tasks);

      expect(result[0]).not.toContain(';');
      expect(result[0]).not.toContain(',');
      expect(result[0]).not.toContain('\n');
      expect(result[0]).not.toContain('\r');
    });
  });
});
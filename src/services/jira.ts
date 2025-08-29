import axios from 'axios';
import { Config } from '../commands/config';

export interface JiraIssue {
  key: string;
  summary: string;
  description?: string;
  status: string;
}

export class JiraService {
  private baseUrl: string;
  private email: string;
  private apiKey: string;

  constructor(config: Config) {
    if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiKey) {
      throw new Error('Jira configuration is incomplete. Please set jiraBaseUrl, jiraEmail, and jiraApiKey.');
    }
    
    this.baseUrl = config.jiraBaseUrl;
    this.email = config.jiraEmail;
    this.apiKey = config.jiraApiKey;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.email}:${this.apiKey}`).toString('base64');
    return `Basic ${credentials}`;
  }

  async getCurrentTasks(): Promise<JiraIssue[]> {
    try {
      const jql = 'assignee = currentUser() AND status != "Done" ORDER BY updated DESC';
      
      const response = await axios.get(`${this.baseUrl}/rest/api/3/search/jql`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        params: {
          jql,
          fields: 'key,summary,description,status',
          maxResults: 50
        }
      });

      return response.data.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: issue.fields.status.name
      }));
    } catch (error) {
      console.error('Error fetching Jira tasks:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Jira authentication failed. Please check your credentials.');
        }
        if (error.response?.status === 404) {
          throw new Error('Jira API endpoint not found. Please check your base URL.');
        }
      }
      throw error;
    }
  }

  async getTaskDescription(issueKey: string): Promise<string> {
    try {
      const response = await axios.get(`${this.baseUrl}/rest/api/3/issue/${issueKey}`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json'
        },
        params: {
          fields: 'summary,description'
        }
      });

      const { summary, description } = response.data.fields;
      return description ? `${summary}: ${description}` : summary;
    } catch (error) {
      console.error(`Error fetching task description for ${issueKey}:`, error);
      return `Task ${issueKey}`;
    }
  }

  formatTasksForClockify(tasks: JiraIssue[]): string[] {
    return tasks.map(task => {
      const description = task.description 
        ? `${task.key}: ${task.summary} - ${task.description.substring(0, 100)}...`
        : `${task.key}: ${task.summary}`;
      
      return description.replace(/[;,\n\r]/g, ' ').trim();
    });
  }
}
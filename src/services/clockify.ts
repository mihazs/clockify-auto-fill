import axios from 'axios';
import dayjs from 'dayjs';
import { Config } from '../commands/config';

export interface TimeEntry {
  id?: string;
  description: string;
  start: string;
  end?: string;
  projectId: string;
  workspaceId: string;
  billable?: boolean;
}

export interface ClockifyTimeEntry {
  id: string;
  description: string;
  timeInterval: {
    start: string;
    end: string;
    duration: string;
  };
  project: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
  };
}

export interface ClockifyReportEntry {
  _id: string;
  description: string;
  userId: string;
  timeInterval: {
    start: string;
    end: string;
    duration: number; // Reports API returns duration as seconds
  };
  projectId: string;
  projectName: string;
  userName: string;
  userEmail: string;
  billable: boolean;
}

export class ClockifyService {
  private apiKey: string;
  private workspaceId: string;
  private projectId: string;
  private defaultStartTime: string;
  private defaultEndTime: string;
  private baseUrl = 'https://api.clockify.me/api/v1';
  private reportsUrl = 'https://reports.api.clockify.me/v1';
  private userId: string | null = null;

  constructor(config: Config) {
    if (!config.clockifyApiKey || !config.workspaceId || !config.projectId) {
      throw new Error('Clockify configuration is incomplete. Please set clockifyApiKey, workspaceId, and projectId.');
    }
    
    this.apiKey = config.clockifyApiKey;
    this.workspaceId = config.workspaceId;
    this.projectId = config.projectId;
    this.defaultStartTime = config.defaultStartTime || '09:00';
    this.defaultEndTime = config.defaultEndTime || '17:00';
  }

  private getHeaders() {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  private async ensureUserId(): Promise<string> {
    if (!this.userId) {
      try {
        const response = await axios.get(`${this.baseUrl}/user`, {
          headers: this.getHeaders(),
          timeout: 10000
        });
        
        if (!response.data?.id) {
          throw new Error('Invalid response from Clockify: missing user ID');
        }
        
        this.userId = response.data.id;
      } catch (error) {
        console.error('Error fetching current user:', error);
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw new Error('Clockify authentication failed. Please check your API key.');
        }
        throw new Error(`Failed to get current user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return this.userId!; // We know it's not null at this point
  }

  async addTimeEntry(entry: Omit<TimeEntry, 'workspaceId' | 'projectId'>): Promise<ClockifyTimeEntry> {
    try {
      const userId = await this.ensureUserId();
      const payload = {
        description: entry.description,
        start: entry.start,
        end: entry.end,
        projectId: this.projectId,
        billable: entry.billable ?? false
      };

      const response = await axios.post(
        `${this.baseUrl}/workspaces/${this.workspaceId}/user/${userId}/time-entries`,
        payload,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error adding time entry:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Clockify authentication failed. Please check your API key.');
        }
        if (error.response?.status === 400) {
          throw new Error(`Invalid time entry data: ${error.response.data?.message || 'Bad request'}`);
        }
      }
      throw error;
    }
  }

  async getTimeEntriesForDate(date: string): Promise<ClockifyTimeEntry[]> {
    try {
      const userId = await this.ensureUserId();
      const startOfDay = dayjs(date).startOf('day').toISOString();
      const endOfDay = dayjs(date).endOf('day').toISOString();

      const response = await axios.get(
        `${this.baseUrl}/workspaces/${this.workspaceId}/user/${userId}/time-entries`,
        {
          headers: this.getHeaders(),
          params: {
            start: startOfDay,
            end: endOfDay,
            'page-size': 50
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching time entries:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Clockify authentication failed. Please check your API key.');
      }
      throw error;
    }
  }

  async hasEntryForDate(date: string): Promise<boolean> {
    const entries = await this.getTimeEntriesForDate(date);
    return entries.length > 0;
  }

  async hasEntryForDateViaAPI(date: string): Promise<boolean> {
    return this.hasEntryForDate(date);
  }

  async getReportData(startDate: string, endDate: string): Promise<ClockifyTimeEntry[]> {
    try {
      const payload = {
        dateRangeStart: dayjs(startDate).startOf('day').toISOString(),
        dateRangeEnd: dayjs(endDate).endOf('day').toISOString(),
        detailedFilter: {
          page: 1,
          pageSize: 1000
        },
        exportType: 'JSON',
        amountShown: 'HIDE_AMOUNT' // Required to avoid 403 permission errors
      };

      const response = await axios.post(
        `${this.reportsUrl}/workspaces/${this.workspaceId}/reports/detailed`,
        payload,
        { headers: this.getHeaders() }
      );

      const reportEntries: ClockifyReportEntry[] = response.data.timeentries || [];
      
      // Convert Reports API format to standard ClockifyTimeEntry format
      const timeEntries: ClockifyTimeEntry[] = reportEntries.map(entry => ({
        id: entry._id,
        description: entry.description,
        timeInterval: {
          start: entry.timeInterval.start,
          end: entry.timeInterval.end,
          duration: this.formatSecondsToISO8601(entry.timeInterval.duration)
        },
        project: {
          id: entry.projectId,
          name: entry.projectName
        },
        user: {
          id: entry.userId,
          name: entry.userName
        }
      }));
      
      return timeEntries;
    } catch (error) {
      console.error('Error fetching report data:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Clockify authentication failed for reports. Please check your API key.');
      }
      throw error;
    }
  }

  async deleteTimeEntry(entryId: string): Promise<void> {
    try {
      await axios.delete(
        `${this.baseUrl}/workspaces/${this.workspaceId}/time-entries/${entryId}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting time entry:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error('Clockify authentication failed. Please check your API key.');
      }
      throw error;
    }
  }

  private parseTime(timeStr: string): { hour: number; minute: number } {
    const [hourStr, minuteStr] = timeStr.split(':');
    return {
      hour: parseInt(hourStr, 10),
      minute: parseInt(minuteStr, 10)
    };
  }

  createTimeEntry(date: string, description: string, startTime?: string, endTime?: string): Omit<TimeEntry, 'workspaceId' | 'projectId'> {
    const startTimeStr = startTime || this.defaultStartTime;
    const endTimeStr = endTime || this.defaultEndTime;
    
    const { hour: startHour, minute: startMinute } = this.parseTime(startTimeStr);
    const { hour: endHour, minute: endMinute } = this.parseTime(endTimeStr);
    
    const start = dayjs(date).hour(startHour).minute(startMinute).second(0).toISOString();
    const end = dayjs(date).hour(endHour).minute(endMinute).second(0).toISOString();

    return {
      description,
      start,
      end,
      billable: false
    };
  }

  /**
   * Convert seconds to ISO 8601 duration format (PT8H30M)
   */
  private formatSecondsToISO8601(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    
    // Handle case where duration is 0
    if (hours === 0 && minutes === 0) duration += '0M';
    
    return duration;
  }
}
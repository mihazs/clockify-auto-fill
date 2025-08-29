import axios from 'axios';

export interface ClockifyWorkspace {
  id: string;
  name: string;
  memberships?: Array<{
    userId: string;
    hourlyRate: {
      amount: number;
      currency: string;
    };
    membershipStatus: string;
    membershipType: string;
  }>;
}

export interface ClockifyProject {
  id: string;
  name: string;
  clientName?: string;
  color: string;
  archived: boolean;
  billable: boolean;
  public: boolean;
}

export interface ClockifyUser {
  id: string;
  name: string;
  email: string;
  profilePicture: string;
  activeWorkspace: string;
  defaultWorkspace: string;
  status: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: any;
}

export class ClockifyWizardService {
  private baseUrl = 'https://api.clockify.me/api/v1';

  private getHeaders(apiKey: string) {
    return {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async validateApiKey(apiKey: string): Promise<ValidationResult> {
    try {
      if (!apiKey || apiKey.trim().length === 0) {
        return { valid: false, error: 'API key cannot be empty' };
      }

      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: this.getHeaders(apiKey),
        timeout: 10000
      });

      const user: ClockifyUser = response.data;
      return { 
        valid: true, 
        data: { 
          user: {
            name: user.name,
            email: user.email,
            id: user.id
          }
        } 
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return { valid: false, error: 'Invalid API key. Please check your Clockify API key.' };
        }
        if (error.response?.status === 403) {
          return { valid: false, error: 'API key does not have sufficient permissions.' };
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          return { valid: false, error: 'Cannot connect to Clockify. Please check your internet connection.' };
        }
        if (error.code === 'ECONNABORTED') {
          return { valid: false, error: 'Request timed out. Please try again.' };
        }
      }
      return { 
        valid: false, 
        error: `Failed to validate API key: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  async fetchWorkspaces(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/workspaces`, {
        headers: this.getHeaders(apiKey),
        timeout: 10000
      });

      const workspaces: ClockifyWorkspace[] = response.data;
      
      if (workspaces.length === 0) {
        return { valid: false, error: 'No workspaces found. You need at least one workspace in Clockify.' };
      }

      return { 
        valid: true, 
        data: { 
          workspaces: workspaces.map(ws => ({
            id: ws.id,
            name: ws.name,
            membershipStatus: ws.memberships?.[0]?.membershipStatus || 'ACTIVE'
          }))
        } 
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return { valid: false, error: 'API key is no longer valid.' };
        }
        if (error.code === 'ECONNABORTED') {
          return { valid: false, error: 'Request timed out while fetching workspaces.' };
        }
      }
      return { 
        valid: false, 
        error: `Failed to fetch workspaces: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  async fetchProjects(apiKey: string, workspaceId: string): Promise<ValidationResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/workspaces/${workspaceId}/projects`, {
        headers: this.getHeaders(apiKey),
        timeout: 15000,
        params: {
          'page-size': 200, // Get more projects in a single request
          archived: false   // Only show active projects
        }
      });

      const projects: ClockifyProject[] = response.data;
      
      if (projects.length === 0) {
        return { valid: false, error: 'No active projects found in this workspace. You need at least one project.' };
      }

      // Sort projects by name and group by client if available
      const sortedProjects = projects
        .filter(p => !p.archived)
        .sort((a, b) => {
          // First sort by client name if available, then by project name
          const clientA = a.clientName || '';
          const clientB = b.clientName || '';
          if (clientA !== clientB) {
            return clientA.localeCompare(clientB);
          }
          return a.name.localeCompare(b.name);
        });

      return { 
        valid: true, 
        data: { 
          projects: sortedProjects.map(p => ({
            id: p.id,
            name: p.name,
            clientName: p.clientName,
            displayName: p.clientName ? `${p.clientName} - ${p.name}` : p.name,
            color: p.color,
            billable: p.billable
          }))
        } 
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return { valid: false, error: 'API key is no longer valid.' };
        }
        if (error.response?.status === 403) {
          return { valid: false, error: 'You do not have permission to access this workspace.' };
        }
        if (error.response?.status === 404) {
          return { valid: false, error: 'Workspace not found. It may have been deleted.' };
        }
        if (error.code === 'ECONNABORTED') {
          return { valid: false, error: 'Request timed out while fetching projects.' };
        }
      }
      return { 
        valid: false, 
        error: `Failed to fetch projects: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  async testConnection(apiKey: string, workspaceId: string, projectId: string): Promise<ValidationResult> {
    try {
      // Test if we can access the specific project
      const response = await axios.get(`${this.baseUrl}/workspaces/${workspaceId}/projects/${projectId}`, {
        headers: this.getHeaders(apiKey),
        timeout: 10000
      });

      const project: ClockifyProject = response.data;
      
      return { 
        valid: true, 
        data: { 
          project: {
            name: project.name,
            id: project.id,
            clientName: project.clientName,
            billable: project.billable
          }
        } 
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return { valid: false, error: 'Project not found. It may have been deleted or archived.' };
        }
        if (error.response?.status === 403) {
          return { valid: false, error: 'You do not have permission to access this project.' };
        }
        if (error.response?.status === 401) {
          return { valid: false, error: 'API key is no longer valid.' };
        }
      }
      return { 
        valid: false, 
        error: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  async getCurrentUser(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: this.getHeaders(apiKey),
        timeout: 10000
      });

      const user: ClockifyUser = response.data;
      return { 
        valid: true, 
        data: { 
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            defaultWorkspace: user.defaultWorkspace,
            activeWorkspace: user.activeWorkspace
          }
        } 
      };
    } catch (error) {
      return { 
        valid: false, 
        error: `Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  // Helper method to format API key for display (show only first and last few characters)
  formatApiKeyForDisplay(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
      return '*'.repeat(apiKey?.length || 0);
    }
    return `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
  }

  // Helper method to validate API key format
  isValidApiKeyFormat(apiKey: string): boolean {
    // Clockify API keys are typically 40+ characters long and contain alphanumeric characters
    return /^[a-zA-Z0-9]{40,}$/.test(apiKey);
  }
}
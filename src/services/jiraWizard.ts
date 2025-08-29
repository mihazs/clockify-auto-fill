import axios from 'axios';

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  projectCategory?: {
    id: string;
    name: string;
    description: string;
  };
}

export interface JiraUser {
  accountId: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
  timeZone: string;
}

export interface JiraIssuesSummary {
  total: number;
  inProgress: number;
  todo: number;
  done: number;
  issues: Array<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    updated: string;
  }>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: any;
}

export class JiraWizardService {
  private getHeaders(email: string, apiToken: string): Record<string, string> {
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  private normalizeBaseUrl(baseUrl: string): string {
    // Remove trailing slash and ensure https://
    let normalized = baseUrl.trim().replace(/\/$/, '');
    
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }
    
    // Handle common Atlassian cloud domain patterns
    if (normalized.includes('.atlassian.net') && !normalized.includes('.atlassian.net/')) {
      // It's likely just the domain without path
      return normalized;
    }
    
    return normalized;
  }

  private async getCloudIdFromUrl(baseUrl: string): Promise<string | null> {
    // Extract cloud ID from Atlassian URL pattern
    // URLs like https://yoursite.atlassian.net correspond to cloud IDs
    const normalizedUrl = this.normalizeBaseUrl(baseUrl);
    const match = normalizedUrl.match(/https:\/\/([^.]+)\.atlassian\.net/);
    
    if (match) {
      // The site name can be used as part of the cloud ID logic
      // But we need the actual UUID cloud ID, so we'll try a test API call to extract it
      return await this.extractCloudIdFromApi(normalizedUrl);
    }
    
    return null;
  }

  private async extractCloudIdFromApi(baseUrl: string): Promise<string | null> {
    try {
      // Use the official tenant_info endpoint to get cloud ID
      const response = await axios.get(`${baseUrl}/_edge/tenant_info`, {
        timeout: 10000,
        validateStatus: () => true // Accept all status codes
      });
      
      // The endpoint returns {"cloudId":"uuid"}
      if (response.data && response.data.cloudId) {
        return response.data.cloudId;
      }
      
      // Fallback: try to extract from response body if format is different
      if (response.data && typeof response.data === 'string') {
        try {
          const parsed = JSON.parse(response.data);
          if (parsed.cloudId) {
            return parsed.cloudId;
          }
        } catch (e) {
          // If JSON parse fails, try regex
          const uuidMatch = response.data.match(/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i);
          if (uuidMatch) {
            return uuidMatch[0];
          }
        }
      }
    } catch (error) {
      // If this fails, we'll fall back to other methods
      console.warn('Failed to get cloud ID from tenant_info endpoint:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return null;
  }

  private async getCloudId(baseUrl: string, email: string, apiToken: string): Promise<string | null> {
    try {
      // For scoped tokens (ATATT), the accessible-resources endpoint may not work
      // Try it first, but expect it to fail for scoped tokens
      if (!apiToken.startsWith('ATATT')) {
        const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: this.getHeaders(email, apiToken),
          timeout: 10000
        });
        
        const resources = response.data;
        if (resources && resources.length > 0) {
          // Find the resource that matches our base URL
          const normalizedUrl = this.normalizeBaseUrl(baseUrl);
          const matchingResource = resources.find((resource: any) => 
            normalizedUrl.includes(resource.url.replace('https://', '').replace('.atlassian.net', ''))
          );
          
          if (matchingResource) {
            return matchingResource.id;
          }
          
          // If no exact match, return the first resource (likely the user's main instance)
          return resources[0].id;
        }
      }
    } catch (error) {
      // For scoped tokens or when accessible-resources fails, try URL-based extraction
      // This is expected for scoped API tokens (ATATT)
    }
    
    // Try to extract from URL pattern
    return await this.getCloudIdFromUrl(baseUrl);
  }

  private async getApiUrl(baseUrl: string, email: string, apiToken: string): Promise<string> {
    const isScopedToken = apiToken.startsWith('ATATT');
    
    if (isScopedToken) {
      // Scoped tokens MUST use the api.atlassian.com format
      const cloudId = await this.getCloudId(baseUrl, email, apiToken);
      if (cloudId) {
        return `https://api.atlassian.com/ex/jira/${cloudId}`;
      }
      
      // If we can't get cloud ID, scoped tokens won't work with direct URLs
      throw new Error('Could not determine cloud ID for scoped API token. Scoped tokens require cloud ID for proper API endpoint formatting.');
    }
    
    // Use direct URL for regular tokens
    return this.normalizeBaseUrl(baseUrl);
  }

  async validateCredentials(baseUrl: string, email: string, apiToken: string): Promise<ValidationResult> {
    try {
      if (!baseUrl?.trim()) {
        return { valid: false, error: 'Jira base URL cannot be empty' };
      }
      
      if (!email?.trim()) {
        return { valid: false, error: 'Email cannot be empty' };
      }
      
      if (!apiToken?.trim()) {
        return { valid: false, error: 'API token cannot be empty' };
      }

      const apiUrl = await this.getApiUrl(baseUrl, email, apiToken);
      const isScopedToken = apiToken.startsWith('ATATT');
      
      // Test authentication by getting current user
      const response = await axios.get(`${apiUrl}/rest/api/3/myself`, {
        headers: this.getHeaders(email, apiToken),
        timeout: 10000
      });

      const user: JiraUser = response.data;
      
      return {
        valid: true,
        data: {
          user: {
            name: user.displayName,
            email: user.emailAddress,
            accountId: user.accountId,
            active: user.active
          },
          apiUrl,
          tokenType: isScopedToken ? 'scoped' : 'standard'
        }
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          const isScopedToken = apiToken.startsWith('ATATT');
          if (isScopedToken) {
            return { 
              valid: false, 
              error: 'Authentication failed with scoped API token. This may be due to insufficient scopes or missing cloud ID. Try creating a new API token with "read:jira-user" and "read:jira-work" scopes, or use a standard (non-scoped) API token.' 
            };
          }
          return { valid: false, error: 'Invalid email or API token. Please check your credentials.' };
        }
        if (error.response?.status === 403) {
          return { valid: false, error: 'Access denied. Your account may not have sufficient permissions.' };
        }
        if (error.response?.status === 404) {
          return { valid: false, error: 'Jira instance not found. Please check the base URL.' };
        }
        if (error.code === 'ENOTFOUND') {
          return { valid: false, error: 'Cannot connect to Jira. Please check the base URL and your internet connection.' };
        }
        if (error.code === 'ECONNABORTED') {
          return { valid: false, error: 'Request timed out. Please try again.' };
        }
      }
      return {
        valid: false,
        error: `Failed to validate Jira credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async testPermissions(baseUrl: string, email: string, apiToken: string): Promise<ValidationResult> {
    try {
      const apiUrl = await this.getApiUrl(baseUrl, email, apiToken);
      
      // Test if user can search for issues assigned to them (using API v3)
      const searchResponse = await axios.get(`${apiUrl}/rest/api/3/search/jql`, {
        headers: this.getHeaders(email, apiToken),
        timeout: 10000,
        params: {
          jql: 'assignee = currentUser()',
          maxResults: 1,
          fields: 'key,summary'
        }
      });

      // Test if user can access projects
      const projectsResponse = await axios.get(`${apiUrl}/rest/api/3/project`, {
        headers: this.getHeaders(email, apiToken),
        timeout: 10000,
        params: {
          maxResults: 5
        }
      });

      const projects: JiraProject[] = projectsResponse.data;
      const searchData = searchResponse.data;

      return {
        valid: true,
        data: {
          canSearchIssues: true,
          canAccessProjects: true,
          projectCount: projects.length,
          assignedIssuesCount: searchData.total || 0,
          projects: projects.slice(0, 3).map(p => ({ // Show only first 3 projects
            key: p.key,
            name: p.name,
            type: p.projectTypeKey
          }))
        }
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          return { valid: false, error: 'Insufficient permissions to search issues or access projects.' };
        }
        if (error.response?.status === 400) {
          return { valid: false, error: 'Invalid search query. This may indicate API compatibility issues.' };
        }
      }
      return {
        valid: false,
        error: `Permission test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getAssignedIssuesSummary(baseUrl: string, email: string, apiToken: string): Promise<ValidationResult> {
    try {
      const apiUrl = await this.getApiUrl(baseUrl, email, apiToken);
      
      // Get issues assigned to current user that are not done (using API v3)
      const response = await axios.get(`${apiUrl}/rest/api/3/search/jql`, {
        headers: this.getHeaders(email, apiToken),
        timeout: 15000,
        params: {
          jql: 'assignee = currentUser() AND status != "Done" ORDER BY updated DESC',
          maxResults: 10,
          fields: 'key,summary,status,priority,updated'
        }
      });

      const data = response.data;
      const issues = data.issues || [];

      // Count issues by status category
      let inProgress = 0;
      let todo = 0;
      let done = 0;

      const issuesSummary = issues.map((issue: any) => {
        const statusCategory = issue.fields.status.statusCategory?.key || 'new';
        
        switch (statusCategory) {
          case 'indeterminate':
            inProgress++;
            break;
          case 'new':
            todo++;
            break;
          case 'done':
            done++;
            break;
        }

        return {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name || 'None',
          updated: issue.fields.updated
        };
      });

      return {
        valid: true,
        data: {
          total: data.total,
          inProgress,
          todo,
          done,
          issues: issuesSummary
        } as JiraIssuesSummary
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          return { valid: false, error: 'Invalid JQL query. Your Jira instance may not support this query format.' };
        }
      }
      return {
        valid: false,
        error: `Failed to fetch assigned issues: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async testConnection(baseUrl: string, email: string, apiToken: string): Promise<ValidationResult> {
    try {
      // Comprehensive connection test
      const credentialsResult = await this.validateCredentials(baseUrl, email, apiToken);
      if (!credentialsResult.valid) {
        return credentialsResult;
      }

      const permissionsResult = await this.testPermissions(baseUrl, email, apiToken);
      if (!permissionsResult.valid) {
        return permissionsResult;
      }

      const issuesResult = await this.getAssignedIssuesSummary(baseUrl, email, apiToken);
      
      return {
        valid: true,
        data: {
          user: credentialsResult.data?.user,
          permissions: permissionsResult.data,
          issues: issuesResult.valid ? issuesResult.data : null,
          apiUrl: credentialsResult.data?.apiUrl
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Helper methods
  formatApiTokenForDisplay(apiToken: string): string {
    if (!apiToken || apiToken.length < 8) {
      return '*'.repeat(apiToken?.length || 0);
    }
    return `${apiToken.substring(0, 4)}${'*'.repeat(apiToken.length - 8)}${apiToken.substring(apiToken.length - 4)}`;
  }

  getTokenTypeInfo(apiToken: string): { type: string; description: string } {
    if (apiToken.startsWith('ATATT')) {
      return {
        type: 'Scoped API Token',
        description: 'Enhanced security token with specific permissions (recommended)'
      };
    } else if (apiToken.startsWith('ATCTT')) {
      return {
        type: 'Personal Access Token',
        description: 'Personal access token for Server/Data Center'
      };
    } else {
      return {
        type: 'Standard API Token',
        description: 'Basic API token (consider upgrading to scoped token)'
      };
    }
  }

  isValidEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidJiraUrl(url: string): boolean {
    try {
      const normalized = this.normalizeBaseUrl(url);
      const urlObj = new URL(normalized);
      
      // Check if it's a valid URL and potentially a Jira instance
      return (
        (urlObj.protocol === 'https:' || urlObj.protocol === 'http:') &&
        urlObj.hostname.length > 0 &&
        (urlObj.hostname.includes('atlassian') || 
         urlObj.hostname.includes('jira') || 
         url.includes('/jira') ||
         // Allow any domain - user might have custom Jira installation
         true)
      );
    } catch {
      return false;
    }
  }

  getJiraUrlSuggestions(input: string): string[] {
    const suggestions = [];
    const cleanInput = input.trim().toLowerCase();
    
    if (cleanInput && !cleanInput.includes('.')) {
      // Suggest Atlassian cloud format
      suggestions.push(`https://${cleanInput}.atlassian.net`);
    }
    
    if (cleanInput && !cleanInput.startsWith('http')) {
      suggestions.push(`https://${cleanInput}`);
    }
    
    return suggestions;
  }
}
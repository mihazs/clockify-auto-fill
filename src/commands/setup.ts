import { Command } from '@commander-js/extra-typings';
import inquirer from 'inquirer';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, saveConfig, Config, isValidTimeFormat, validateTimeRange, calculateHours } from './config';
import { ClockifyWizardService } from '../services/clockifyWizard';
import { JiraWizardService } from '../services/jiraWizard';
import { WizardUI } from '../services/wizardUI';

export function createSetupCommand(): Command {
  const setup = new Command('setup')
    .description('Interactive setup wizard for first-time configuration');

  setup.action(async () => {
    try {
      await runSetupWizard();
    } catch (error) {
      const { WizardUI } = await import('../services/wizardUI');
      
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          WizardUI.showErrorBox(
            'Network Connection Error',
            'Unable to connect to the internet or API services.',
            [
              'Check your internet connection',
              'Verify that your firewall allows outbound connections',
              'Try again in a few moments',
              'Contact your network administrator if the problem persists'
            ]
          );
        } else if (error.message.includes('API key')) {
          WizardUI.showErrorBox(
            'API Key Error', 
            error.message,
            [
              'Double-check your API key from the service provider',
              'Ensure you have the correct permissions',
              'Try regenerating your API key if possible'
            ]
          );
        } else if (error.message.includes('timeout')) {
          WizardUI.showErrorBox(
            'Request Timeout',
            'The request took too long to complete.',
            [
              'Check your internet connection speed',
              'Try again in a few moments',
              'Consider using a different network if available'
            ]
          );
        } else {
          WizardUI.showErrorBox(
            'Setup Failed',
            error.message,
            [
              'Try running the setup wizard again',
              'Check the error message above for specific details',
              'Report this issue if the problem persists'
            ]
          );
        }
      } else {
        WizardUI.error('Setup wizard failed', 'An unknown error occurred');
      }
      
      console.log('\\n💡 You can try again by running: clockify-auto setup');
      process.exit(1);
    }
  });

  return setup;
}

export async function runSetupWizard(): Promise<Config> {
  // Handle Ctrl+C gracefully
  const handleInterrupt = () => {
    console.log('\\n\\n👋 Setup cancelled by user');
    console.log('💡 You can run the setup wizard anytime with: clockify-auto setup');
    process.exit(0);
  };
  
  process.on('SIGINT', handleInterrupt);
  process.on('SIGTERM', handleInterrupt);

  WizardUI.showWelcome();
  
  // Load existing config
  const existingConfig = await loadConfig();
  const hasExistingConfig = Object.keys(existingConfig).length > 0;
  
  if (hasExistingConfig) {
    const { continueSetup } = await inquirer.prompt([{
      type: 'confirm',
      name: 'continueSetup',
      message: 'Existing configuration found. Do you want to reconfigure?',
      default: false
    }]);
    
    if (!continueSetup) {
      WizardUI.info('Setup cancelled. Your existing configuration remains unchanged.');
      return existingConfig;
    }
  }

  let config: Config = { ...existingConfig };
  
  // Step 1: Clockify Configuration
  config = await configureClockify(config);
  
  // Step 2: Jira Configuration (Optional)
  config = await configureJira(config);
  
  // Step 3: Reports Configuration
  config = await configureReports(config);
  
  // Step 4: Work Hours Configuration
  config = await configureWorkHours(config);
  
  // Step 5: Save Configuration
  await saveConfig(config);
  WizardUI.success('Configuration saved successfully!');
  
  // Step 5: Final Validation and Summary
  await showConfigurationSummary(config);
  
  WizardUI.showNextSteps(true);
  
  // Remove interrupt handlers since we're done
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  
  return config;
}

async function configureClockify(config: Config): Promise<Config> {
  WizardUI.showSectionHeader('🔐 Clockify Configuration', 'Connect to your Clockify account');
  
  const clockifyService = new ClockifyWizardService();
  
  // Get API Key
  let apiKey = config.clockifyApiKey || '';
  let apiKeyValid = false;
  let userInfo: any = null;
  
  while (!apiKeyValid) {
    if (!apiKey) {
      WizardUI.info('You can find your API key at: https://clockify.me/user/settings');
    }
    
    const { inputApiKey } = await inquirer.prompt([{
      type: 'password',
      name: 'inputApiKey',
      message: 'Enter your Clockify API key:',
      default: apiKey,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'API key is required';
        }
        if (!clockifyService.isValidApiKeyFormat(input.trim())) {
          return 'API key should be at least 40 characters long';
        }
        return true;
      }
    }]);
    
    apiKey = inputApiKey.trim();
    
    // Validate API Key
    const validation = await WizardUI.withSpinner(
      'Validating API key...',
      () => clockifyService.validateApiKey(apiKey),
      undefined,
      'API key validation failed'
    );
    
    if (validation.valid) {
      apiKeyValid = true;
      userInfo = validation.data?.user;
      WizardUI.success('API key validated successfully', `Welcome, ${userInfo?.name || 'User'}!`);
    } else {
      WizardUI.error('Invalid API key', validation.error);
      
      const { retry } = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try a different API key?',
        default: true
      }]);
      
      if (!retry) {
        throw new Error('Clockify API key is required for setup');
      }
      apiKey = ''; // Clear for retry
    }
  }
  
  config.clockifyApiKey = apiKey;
  
  // Get Workspaces
  const workspacesResult = await WizardUI.withSpinner(
    'Fetching your workspaces...',
    () => clockifyService.fetchWorkspaces(apiKey)
  );
  
  if (!workspacesResult.valid) {
    throw new Error(`Failed to fetch workspaces: ${workspacesResult.error}`);
  }
  
  const workspaces = workspacesResult.data?.workspaces || [];
  let selectedWorkspace: any;
  
  if (workspaces.length === 1) {
    selectedWorkspace = workspaces[0];
    WizardUI.success('Using workspace', selectedWorkspace.name);
  } else {
    const { workspaceId } = await inquirer.prompt([{
      type: 'list',
      name: 'workspaceId',
      message: 'Select your workspace:',
      choices: workspaces.map((ws: any) => ({
        name: `${ws.name} (${ws.membershipStatus})`,
        value: ws.id
      })),
      default: config.workspaceId
    }]);
    
    selectedWorkspace = workspaces.find((ws: any) => ws.id === workspaceId);
  }
  
  config.workspaceId = selectedWorkspace.id;
  
  // Get Projects
  const projectsResult = await WizardUI.withSpinner(
    'Fetching projects...',
    () => clockifyService.fetchProjects(apiKey, selectedWorkspace.id)
  );
  
  if (!projectsResult.valid) {
    throw new Error(`Failed to fetch projects: ${projectsResult.error}`);
  }
  
  const projects = projectsResult.data?.projects || [];
  let selectedProject: any;
  
  if (projects.length === 1) {
    selectedProject = projects[0];
    WizardUI.success('Using project', selectedProject.displayName);
  } else {
    const { projectId } = await inquirer.prompt([{
      type: 'list',
      name: 'projectId',
      message: 'Select your default project:',
      choices: projects.map((p: any) => ({
        name: p.displayName + (p.billable ? ' 💰' : ''),
        value: p.id
      })),
      default: config.projectId,
      pageSize: 15
    }]);
    
    selectedProject = projects.find((p: any) => p.id === projectId);
  }
  
  config.projectId = selectedProject.id;
  
  // Final validation
  await WizardUI.withSpinner(
    'Testing Clockify connection...',
    () => clockifyService.testConnection(apiKey, selectedWorkspace.id, selectedProject.id)
  );
  
  WizardUI.success('Clockify configuration completed!', 
    `Workspace: ${selectedWorkspace.name}, Project: ${selectedProject.displayName}`);
  
  return config;
}

async function configureJira(config: Config): Promise<Config> {
  WizardUI.showSectionHeader('🎫 Jira Integration (Optional)', 'Automatically fetch task descriptions from Jira');
  
  const { enableJira } = await inquirer.prompt([{
    type: 'confirm',
    name: 'enableJira',
    message: 'Would you like to configure Jira integration?',
    default: !!(config.jiraBaseUrl || config.jiraEmail || config.jiraApiKey)
  }]);
  
  if (!enableJira) {
    WizardUI.info('Jira integration skipped. You can configure it later with the wizard.');
    return config;
  }
  
  const jiraService = new JiraWizardService();
  
  // Get Jira Configuration
  let jiraValid = false;
  let jiraConfig = {
    baseUrl: config.jiraBaseUrl || '',
    email: config.jiraEmail || '',
    apiToken: config.jiraApiKey || ''
  };
  
  while (!jiraValid) {
    // Base URL
    if (!jiraConfig.baseUrl) {
      WizardUI.info('Examples: https://yourcompany.atlassian.net or https://jira.yourcompany.com');
    }
    
    const { baseUrl } = await inquirer.prompt([{
      type: 'input',
      name: 'baseUrl',
      message: 'Enter your Jira base URL:',
      default: jiraConfig.baseUrl,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Jira base URL is required';
        }
        if (!jiraService.isValidJiraUrl(input.trim())) {
          return 'Please enter a valid URL (e.g., https://yourcompany.atlassian.net)';
        }
        return true;
      },
      filter: (input: string) => input.trim()
    }]);
    
    jiraConfig.baseUrl = baseUrl;
    
    // Email
    const { email } = await inquirer.prompt([{
      type: 'input',
      name: 'email',
      message: 'Enter your Jira email:',
      default: jiraConfig.email,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Email is required';
        }
        if (!jiraService.isValidEmailFormat(input.trim())) {
          return 'Please enter a valid email address';
        }
        return true;
      },
      filter: (input: string) => input.trim()
    }]);
    
    jiraConfig.email = email;
    
    // API Token
    if (!jiraConfig.apiToken) {
      WizardUI.info('Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens');
      WizardUI.info('💡 For best compatibility, create a standard (non-scoped) API token');
      WizardUI.info('If using scoped tokens, ensure they have "read:jira-user" and "read:jira-work" scopes');
    }
    
    const { apiToken } = await inquirer.prompt([{
      type: 'password',
      name: 'apiToken',
      message: 'Enter your Jira API token:',
      default: jiraConfig.apiToken,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'API token is required';
        }
        return true;
      }
    }]);
    
    jiraConfig.apiToken = apiToken.trim();
    
    // Validate Jira Connection
    const validation = await WizardUI.withSpinner(
      'Testing Jira connection...',
      () => jiraService.testConnection(jiraConfig.baseUrl, jiraConfig.email, jiraConfig.apiToken)
    );
    
    if (validation.valid) {
      jiraValid = true;
      const data = validation.data;
      
      // Show token type information
      const tokenInfo = jiraService.getTokenTypeInfo(jiraConfig.apiToken);
      
      WizardUI.success('Jira connection successful!', `Welcome, ${data?.user?.name}!`);
      WizardUI.info(`Token type: ${tokenInfo.type}`, tokenInfo.description);
      
      if (data?.issues?.total > 0) {
        WizardUI.info(`Found ${data.issues.total} assigned issues`, 
          `${data.issues.inProgress} in progress, ${data.issues.todo} to do`);
      }
      
      if (data?.permissions?.projectCount > 0) {
        WizardUI.info(`Access to ${data.permissions.projectCount} projects confirmed`);
      }
    } else {
      WizardUI.error('Jira connection failed', validation.error);
      
      const { retry } = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try different Jira credentials?',
        default: true
      }]);
      
      if (!retry) {
        WizardUI.warning('Jira integration skipped');
        return config;
      }
    }
  }
  
  config.jiraBaseUrl = jiraConfig.baseUrl;
  config.jiraEmail = jiraConfig.email;
  config.jiraApiKey = jiraConfig.apiToken;
  
  WizardUI.success('Jira integration configured successfully!');
  
  return config;
}

async function configureReports(config: Config): Promise<Config> {
  WizardUI.showSectionHeader('📊 Reports Configuration', 'Set up PDF report generation');
  
  const defaultReportDir = path.join(os.homedir(), 'Documents', 'Clockify-Reports');
  
  const { reportDir } = await inquirer.prompt([{
    type: 'input',
    name: 'reportDir',
    message: 'Enter directory for PDF reports:',
    default: config.reportDir || defaultReportDir,
    validate: async (input: string) => {
      if (!input.trim()) {
        return 'Reports directory is required';
      }
      
      try {
        await fs.ensureDir(input.trim());
        return true;
      } catch (error) {
        return `Cannot create directory: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    filter: (input: string) => path.resolve(input.trim())
  }]);
  
  config.reportDir = reportDir;
  
  // Test directory access
  await WizardUI.withSpinner(
    'Creating reports directory...',
    async () => {
      await fs.ensureDir(reportDir);
      // Test write access
      const testFile = path.join(reportDir, '.test');
      await fs.writeFile(testFile, 'test');
      await fs.remove(testFile);
    }
  );
  
  WizardUI.success('Reports directory configured', reportDir);
  
  return config;
}

async function configureWorkHours(config: Config): Promise<Config> {
  WizardUI.showSectionHeader('⏰ Work Hours Configuration', 'Set default start and end times for time entries');
  
  const { configureHours } = await inquirer.prompt([{
    type: 'confirm',
    name: 'configureHours',
    message: 'Would you like to configure custom work hours?',
    default: !!(config.defaultStartTime || config.defaultEndTime)
  }]);
  
  if (!configureHours) {
    WizardUI.info('Using default work hours (9:00 AM - 5:00 PM). You can configure custom hours later.');
    return config;
  }
  
  let hoursValid = false;
  let timeConfig = {
    startTime: config.defaultStartTime || '09:00',
    endTime: config.defaultEndTime || '17:00'
  };
  
  while (!hoursValid) {
    const responses = await inquirer.prompt([
      {
        type: 'input',
        name: 'startTime',
        message: 'Enter your work start time (HH:mm format):',
        default: timeConfig.startTime,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Start time is required';
          }
          if (!isValidTimeFormat(input.trim())) {
            return 'Please use HH:mm format (e.g., "09:00")';
          }
          return true;
        },
        filter: (input: string) => input.trim()
      },
      {
        type: 'input',
        name: 'endTime',
        message: 'Enter your work end time (HH:mm format):',
        default: timeConfig.endTime,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'End time is required';
          }
          if (!isValidTimeFormat(input.trim())) {
            return 'Please use HH:mm format (e.g., "17:00")';
          }
          return true;
        },
        filter: (input: string) => input.trim()
      }
    ]);
    
    timeConfig.startTime = responses.startTime;
    timeConfig.endTime = responses.endTime;
    
    // Validate time range
    const validation = validateTimeRange(timeConfig.startTime, timeConfig.endTime);
    
    if (validation.valid) {
      hoursValid = true;
      const duration = calculateHours(timeConfig.startTime, timeConfig.endTime);
      
      WizardUI.success('Work hours configured successfully!', 
        `${timeConfig.startTime} - ${timeConfig.endTime} (${duration} hours per day)`);
    } else {
      WizardUI.error('Invalid time range', validation.error);
      
      const { retry } = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Would you like to try different times?',
        default: true
      }]);
      
      if (!retry) {
        WizardUI.warning('Using default work hours (9:00 AM - 5:00 PM)');
        return config;
      }
    }
  }
  
  config.defaultStartTime = timeConfig.startTime;
  config.defaultEndTime = timeConfig.endTime;
  
  return config;
}

async function showConfigurationSummary(config: Config): Promise<void> {
  WizardUI.showSectionHeader('📋 Configuration Summary');
  
  const workHoursDisplay = (config.defaultStartTime && config.defaultEndTime) 
    ? `${config.defaultStartTime} - ${config.defaultEndTime} (${calculateHours(config.defaultStartTime, config.defaultEndTime)}h)`
    : 'Default (09:00 - 17:00)';

  const summary = {
    'Clockify API Key': config.clockifyApiKey ? '✓ Configured' : '✗ Not configured',
    'Workspace': config.workspaceId || 'Not configured',
    'Project': config.projectId || 'Not configured',
    'Jira Base URL': config.jiraBaseUrl || 'Not configured',
    'Jira Email': config.jiraEmail || 'Not configured',
    'Jira API Token': config.jiraApiKey ? '✓ Configured' : '✗ Not configured',
    'Reports Directory': config.reportDir || 'Not configured',
    'Work Hours': workHoursDisplay
  };
  
  WizardUI.showConfigSummary(summary);
  
  const { runTest } = await inquirer.prompt([{
    type: 'confirm',
    name: 'runTest',
    message: 'Would you like to run a test to verify everything is working?',
    default: true
  }]);
  
  if (runTest) {
    await testConfiguration(config);
  }
}

async function testConfiguration(config: Config): Promise<void> {
  WizardUI.showSectionHeader('🧪 Testing Configuration');
  
  const clockifyService = new ClockifyWizardService();
  
  // Test Clockify
  if (config.clockifyApiKey && config.workspaceId && config.projectId) {
    await WizardUI.withSpinner(
      'Testing Clockify connection...',
      () => clockifyService.testConnection(config.clockifyApiKey!, config.workspaceId!, config.projectId!)
    );
    WizardUI.success('Clockify test passed');
  }
  
  // Test Jira if configured
  if (config.jiraBaseUrl && config.jiraEmail && config.jiraApiKey) {
    const jiraService = new JiraWizardService();
    await WizardUI.withSpinner(
      'Testing Jira connection...',
      () => jiraService.testConnection(config.jiraBaseUrl!, config.jiraEmail!, config.jiraApiKey!)
    );
    WizardUI.success('Jira test passed');
  }
  
  // Test reports directory
  if (config.reportDir) {
    await WizardUI.withSpinner(
      'Testing reports directory...',
      async () => {
        const testFile = path.join(config.reportDir!, '.write-test');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
      }
    );
    WizardUI.success('Reports directory test passed');
  }
  
  WizardUI.success('All tests passed! Your configuration is ready to use.');
}
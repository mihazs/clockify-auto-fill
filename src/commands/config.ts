import { Command } from '@commander-js/extra-typings';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ClockifyWizardService } from '../services/clockifyWizard';
import { JiraWizardService } from '../services/jiraWizard';
import { WizardUI } from '../services/wizardUI';
import { runSetupWizard } from './setup';

export interface Config {
  clockifyApiKey?: string;
  workspaceId?: string;
  projectId?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiKey?: string;
  reportDir?: string;
  defaultStartTime?: string; // Format: HH:mm (e.g., "09:00")
  defaultEndTime?: string;   // Format: HH:mm (e.g., "17:00")
  scheduleTime?: string;     // Format: HH:mm (e.g., "18:00") - when to run auto-fill
  scheduleDays?: number[];   // Days of week: 0=Sunday, 1=Monday, etc. Default: [1,2,3,4,5] (weekdays)
  fallbackTaskDescription?: string; // Description to use when no active Jira tasks found
  hourlyRate?: number;       // Hourly rate for remuneration calculations
}

const CONFIG_DIR = path.join(os.homedir(), '.clockify-auto-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<Config> {
  try {
    await fs.ensureDir(CONFIG_DIR);
    let config: Config = {};
    
    if (await fs.pathExists(CONFIG_FILE)) {
      config = await fs.readJson(CONFIG_FILE);
    }
    
    // Override with environment variables if present
    if (process.env.CLOCKIFY_API_KEY) config.clockifyApiKey = process.env.CLOCKIFY_API_KEY;
    if (process.env.CLOCKIFY_WORKSPACE_ID) config.workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
    if (process.env.CLOCKIFY_PROJECT_ID) config.projectId = process.env.CLOCKIFY_PROJECT_ID;
    if (process.env.JIRA_BASE_URL) config.jiraBaseUrl = process.env.JIRA_BASE_URL;
    if (process.env.JIRA_EMAIL) config.jiraEmail = process.env.JIRA_EMAIL;
    if (process.env.JIRA_API_KEY) config.jiraApiKey = process.env.JIRA_API_KEY;
    if (process.env.REPORT_DIR) config.reportDir = process.env.REPORT_DIR;
    if (process.env.DEFAULT_START_TIME) config.defaultStartTime = process.env.DEFAULT_START_TIME;
    if (process.env.DEFAULT_END_TIME) config.defaultEndTime = process.env.DEFAULT_END_TIME;
    
    return config;
  } catch (error) {
    console.error('Error loading config:', error);
    return {};
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await fs.ensureDir(CONFIG_DIR);
    await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}

export function createConfigCommand(): Command {
  const config = new Command('config')
    .description('Manage configuration settings');

  config
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key')
    .argument('<value>', 'Configuration value')
    .action(async (key: string, value: string) => {
      const currentConfig = await loadConfig();
      
      const validKeys = [
        'clockifyApiKey',
        'workspaceId', 
        'projectId',
        'jiraBaseUrl',
        'jiraEmail',
        'jiraApiKey',
        'reportDir',
        'defaultStartTime',
        'defaultEndTime',
        'scheduleTime',
        'scheduleDays',
        'fallbackTaskDescription',
        'hourlyRate'
      ];

      if (!validKeys.includes(key)) {
        console.error(`Invalid key: ${key}`);
        console.error(`Valid keys: ${validKeys.join(', ')}`);
        return;
      }

      // Validate time format for time-related keys
      if (key === 'defaultStartTime' || key === 'defaultEndTime' || key === 'scheduleTime') {
        if (!isValidTimeFormat(value)) {
          console.error(`Invalid time format: ${value}. Use HH:mm format (e.g., "09:00")`);
          return;
        }
        
        // If both times are set, validate the range
        if (key === 'defaultStartTime' || key === 'defaultEndTime') {
          const otherTimeKey = key === 'defaultStartTime' ? 'defaultEndTime' : 'defaultStartTime';
          const otherTime = currentConfig[otherTimeKey as keyof Config];
          
          if (otherTime && typeof otherTime === 'string') {
            const startTime = key === 'defaultStartTime' ? value : otherTime;
            const endTime = key === 'defaultEndTime' ? value : otherTime;
            
            const validation = validateTimeRange(startTime, endTime);
            if (!validation.valid) {
              console.error(`Time validation failed: ${validation.error}`);
              return;
            }
          }
        }
      }

      // Validate hourly rate
      if (key === 'hourlyRate') {
        const rate = parseFloat(value);
        if (isNaN(rate) || rate <= 0) {
          console.error('Invalid hourly rate. Must be a positive number (e.g., "25.50")');
          return;
        }
        (currentConfig as any)[key] = rate;
        await saveConfig(currentConfig);
        console.log(`Set ${key} = $${rate.toFixed(2)}`);
        return;
      }

      // Validate schedule days
      if (key === 'scheduleDays') {
        try {
          const days = JSON.parse(value) as number[];
          if (!Array.isArray(days) || !days.every(day => typeof day === 'number' && day >= 0 && day <= 6)) {
            console.error('Invalid scheduleDays format. Use JSON array of numbers 0-6 (e.g., "[1,2,3,4,5]" for weekdays)');
            return;
          }
          (currentConfig as any)[key] = days;
          await saveConfig(currentConfig);
          console.log(`Set ${key} = ${JSON.stringify(days)}`);
          return;
        } catch (error) {
          console.error('Invalid JSON format for scheduleDays. Use JSON array (e.g., "[1,2,3,4,5]")');
          return;
        }
      }

      (currentConfig as any)[key] = value;
      await saveConfig(currentConfig);
      console.log(`Set ${key} = ${key.toLowerCase().includes('key') ? '*'.repeat(value.length) : value}`);
    });

  config
    .command('get')
    .description('Get a configuration value')
    .argument('[key]', 'Configuration key (optional, shows all if omitted)')
    .action(async (key?: string) => {
      const currentConfig = await loadConfig();
      
      if (key) {
        const value = (currentConfig as any)[key];
        if (value !== undefined) {
          const displayValue = key.toLowerCase().includes('key') ? '*'.repeat(String(value).length) : 
                              key === 'hourlyRate' ? `$${parseFloat(value).toFixed(2)}` : value;
          console.log(`${key} = ${displayValue}`);
        } else {
          console.log(`${key} is not set`);
        }
      } else {
        console.log('Current configuration:');
        Object.entries(currentConfig).forEach(([k, v]) => {
          let displayValue;
          if (k.toLowerCase().includes('key')) {
            displayValue = '*'.repeat(String(v).length);
          } else if (k === 'hourlyRate') {
            displayValue = `$${parseFloat(String(v)).toFixed(2)}`;
          } else {
            displayValue = v;
          }
          console.log(`  ${k} = ${displayValue}`);
        });
      }
    });

  config
    .command('unset')
    .description('Remove a configuration value')
    .argument('<key>', 'Configuration key')
    .action(async (key: string) => {
      const currentConfig = await loadConfig();
      
      if ((currentConfig as any)[key] !== undefined) {
        delete (currentConfig as any)[key];
        await saveConfig(currentConfig);
        console.log(`Unset ${key}`);
      } else {
        console.log(`${key} is not set`);
      }
    });

  config
    .command('wizard')
    .description('Run the interactive setup wizard')
    .action(async () => {
      try {
        await runSetupWizard();
      } catch (error) {
        console.error('Setup wizard failed:', error);
        process.exit(1);
      }
    });

  config
    .command('validate')
    .description('Validate all configuration settings')
    .action(async () => {
      await validateConfiguration();
    });

  config
    .command('reset')
    .description('Reset configuration settings')
    .option('--all', 'Reset all settings')
    .option('--clockify', 'Reset only Clockify settings')
    .option('--jira', 'Reset only Jira settings')
    .action(async (options) => {
      await resetConfiguration(options);
    });

  config
    .command('export')
    .description('Export configuration to a file')
    .argument('[file]', 'Output file path', 'clockify-config.json')
    .action(async (file: string) => {
      await exportConfiguration(file);
    });

  config
    .command('import')
    .description('Import configuration from a file')
    .argument('<file>', 'Input file path')
    .action(async (file: string) => {
      await importConfiguration(file);
    });

  config
    .command('list')
    .description('List all configuration keys and their current values')
    .action(async () => {
      const currentConfig = await loadConfig();
      
      if (Object.keys(currentConfig).length === 0) {
        console.log('📋 No configuration found');
        console.log('💡 Run "clockify-auto config wizard" to get started');
        return;
      }
      
      console.log('📋 Current Configuration');
      console.log('═'.repeat(60));
      Object.entries(currentConfig).forEach(([k, v]) => {
        let displayValue;
        if (k.toLowerCase().includes('key')) {
          displayValue = '*'.repeat(String(v).length);
        } else if (k === 'hourlyRate') {
          displayValue = `$${parseFloat(String(v)).toFixed(2)}`;
        } else {
          displayValue = v;
        }
        console.log(`  ${k.padEnd(25)} = ${displayValue}`);
      });
      
      console.log('\n💡 Use "clockify-auto config help" to see all available options');
    });

  config
    .command('help')
    .description('Show all available configuration options')
    .action(async () => {
      console.log('📋 Available Configuration Options');
      console.log('═'.repeat(60));
      
      console.log('\n🔗 Clockify Settings (Required):');
      console.log('  clockifyApiKey      - Your Clockify API key');
      console.log('  workspaceId         - Clockify workspace ID');
      console.log('  projectId           - Clockify project ID');
      
      console.log('\n🔗 Jira Integration (Optional):');
      console.log('  jiraBaseUrl         - Jira instance URL (e.g., "https://company.atlassian.net")');
      console.log('  jiraEmail           - Your Jira email address');
      console.log('  jiraApiKey          - Jira API token');
      
      console.log('\n⏰ Time Settings:');
      console.log('  defaultStartTime    - Default work start time (HH:mm format, e.g., "09:00")');
      console.log('  defaultEndTime      - Default work end time (HH:mm format, e.g., "17:00")');
      console.log('  scheduleTime        - When to run auto-fill (HH:mm format, e.g., "18:00")');
      console.log('  scheduleDays        - Days to run scheduler (JSON array, e.g., "[1,2,3,4,5]")');
      console.log('                        Days: 0=Sunday, 1=Monday, ..., 6=Saturday');
      
      console.log('\n📋 Task Settings:');
      console.log('  fallbackTaskDescription - Description when no Jira tasks found');
      console.log('                           (default: "Retro, refinement and planning")');
      
      console.log('\n💰 Financial Settings:');
      console.log('  hourlyRate          - Your hourly rate for financial analytics');
      console.log('                        (positive number, e.g., "25.50")');
      
      console.log('\n📁 Other Settings:');
      console.log('  reportDir           - Directory for PDF reports');
      
      console.log('\n💡 Usage Examples:');
      console.log('  clockify-auto config set clockifyApiKey "your-api-key"');
      console.log('  clockify-auto config set defaultStartTime "09:00"');
      console.log('  clockify-auto config set scheduleDays "[1,2,3,4,5]"');
      console.log('  clockify-auto config set hourlyRate 35.50');
      console.log('  clockify-auto config set fallbackTaskDescription "Planning and meetings"');
      
      console.log('\n🔍 Other Commands:');
      console.log('  clockify-auto config list         - List all current configuration values');
      console.log('  clockify-auto config get [key]    - View configuration (all or specific key)');
      console.log('  clockify-auto config wizard       - Interactive setup wizard');
      console.log('  clockify-auto config validate     - Test all connections');
      console.log('  clockify-auto config export       - Export config to file');
      console.log('  clockify-auto config reset        - Reset configuration');
    });

  return config;
}

// Time validation utilities
export function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

export function validateTimeRange(startTime: string, endTime: string): { valid: boolean; error?: string } {
  if (!isValidTimeFormat(startTime)) {
    return { valid: false, error: 'Start time must be in HH:mm format (e.g., "09:00")' };
  }
  
  if (!isValidTimeFormat(endTime)) {
    return { valid: false, error: 'End time must be in HH:mm format (e.g., "17:00")' };
  }
  
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  if (startTotalMinutes >= endTotalMinutes) {
    return { valid: false, error: 'Start time must be before end time' };
  }
  
  const durationMinutes = endTotalMinutes - startTotalMinutes;
  if (durationMinutes < 60) {
    return { valid: false, error: 'Duration must be at least 1 hour' };
  }
  
  if (durationMinutes > 24 * 60) {
    return { valid: false, error: 'Duration cannot exceed 24 hours' };
  }
  
  return { valid: true };
}

export function calculateHours(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  return (endTotalMinutes - startTotalMinutes) / 60;
}

async function validateConfiguration(): Promise<void> {
  WizardUI.showSectionHeader('🔍 Configuration Validation');
  
  const config = await loadConfig();
  const results: Record<string, { valid: boolean; error?: string; details?: string }> = {};
  
  // Validate Clockify
  if (config.clockifyApiKey && config.workspaceId && config.projectId) {
    const clockifyService = new ClockifyWizardService();
    
    try {
      const result = await WizardUI.withSpinner(
        'Validating Clockify configuration...',
        () => clockifyService.testConnection(config.clockifyApiKey!, config.workspaceId!, config.projectId!)
      );
      
      results.clockify = {
        valid: result.valid,
        error: result.error,
        details: result.valid ? `Project: ${result.data?.project?.name}` : undefined
      };
    } catch (error) {
      results.clockify = {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } else {
    results.clockify = {
      valid: false,
      error: 'Incomplete Clockify configuration (missing API key, workspace, or project)'
    };
  }
  
  // Validate Jira (if configured)
  if (config.jiraBaseUrl && config.jiraEmail && config.jiraApiKey) {
    const jiraService = new JiraWizardService();
    
    try {
      const result = await WizardUI.withSpinner(
        'Validating Jira configuration...',
        () => jiraService.testConnection(config.jiraBaseUrl!, config.jiraEmail!, config.jiraApiKey!)
      );
      
      results.jira = {
        valid: result.valid,
        error: result.error,
        details: result.valid ? `User: ${result.data?.user?.name}, Issues: ${result.data?.issues?.total || 0}` : undefined
      };
    } catch (error) {
      results.jira = {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  } else if (config.jiraBaseUrl || config.jiraEmail || config.jiraApiKey) {
    results.jira = {
      valid: false,
      error: 'Incomplete Jira configuration (missing base URL, email, or API token)'
    };
  }
  
  // Validate Reports Directory
  if (config.reportDir) {
    try {
      await fs.ensureDir(config.reportDir);
      const testFile = path.join(config.reportDir, '.test');
      await fs.writeFile(testFile, 'test');
      await fs.remove(testFile);
      
      results.reports = {
        valid: true,
        details: `Directory: ${config.reportDir}`
      };
    } catch (error) {
      results.reports = {
        valid: false,
        error: `Cannot access reports directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  } else {
    results.reports = {
      valid: false,
      error: 'Reports directory not configured'
    };
  }
  
  // Validate Time Configuration
  if (config.defaultStartTime || config.defaultEndTime) {
    if (config.defaultStartTime && config.defaultEndTime) {
      const validation = validateTimeRange(config.defaultStartTime, config.defaultEndTime);
      
      if (validation.valid) {
        const durationHours = calculateHours(config.defaultStartTime, config.defaultEndTime);
        results.times = {
          valid: true,
          details: `Work hours: ${config.defaultStartTime} - ${config.defaultEndTime} (${durationHours}h)`
        };
      } else {
        results.times = {
          valid: false,
          error: validation.error
        };
      }
    } else {
      results.times = {
        valid: false,
        error: 'Both start and end times must be configured together'
      };
    }
  } else {
    results.times = {
      valid: true,
      details: 'Using default work hours (9:00 AM - 5:00 PM)'
    };
  }
  
  // Display results
  console.log('\n🔍 Validation Results');
  console.log('═'.repeat(50));
  
  Object.entries(results).forEach(([service, result]) => {
    const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
    
    if (result.valid) {
      WizardUI.success(`${serviceName} configuration is valid`, result.details);
    } else {
      WizardUI.error(`${serviceName} configuration is invalid`, result.error);
    }
  });
  
  const allValid = Object.values(results).every(r => r.valid);
  const configuredCount = Object.values(results).filter(r => r.valid).length;
  
  console.log('═'.repeat(50));
  
  if (allValid) {
    WizardUI.success('All configured services are valid and ready to use!');
  } else {
    WizardUI.warning(`${configuredCount} of ${Object.keys(results).length} configurations are valid`);
    WizardUI.info('Run "clockify-auto config wizard" to fix configuration issues');
  }
}

async function resetConfiguration(options: { all?: boolean; clockify?: boolean; jira?: boolean }): Promise<void> {
  const config = await loadConfig();
  
  if (options.all) {
    const updatedConfig: Config = {};
    await saveConfig(updatedConfig);
    WizardUI.success('All configuration settings have been reset');
    return;
  }
  
  if (options.clockify) {
    delete config.clockifyApiKey;
    delete config.workspaceId;
    delete config.projectId;
    WizardUI.success('Clockify configuration has been reset');
  }
  
  if (options.jira) {
    delete config.jiraBaseUrl;
    delete config.jiraEmail;
    delete config.jiraApiKey;
    WizardUI.success('Jira configuration has been reset');
  }
  
  if (!options.clockify && !options.jira) {
    WizardUI.error('Please specify what to reset: --all, --clockify, or --jira');
    return;
  }
  
  await saveConfig(config);
}

async function exportConfiguration(file: string): Promise<void> {
  try {
    const config = await loadConfig();
    
    // Create a sanitized copy for export (hide sensitive data)
    const exportConfig = {
      ...config,
      clockifyApiKey: config.clockifyApiKey ? '[HIDDEN]' : undefined,
      jiraApiKey: config.jiraApiKey ? '[HIDDEN]' : undefined
    };
    
    const exportPath = path.resolve(file);
    await fs.writeJson(exportPath, exportConfig, { spaces: 2 });
    
    WizardUI.success('Configuration exported', exportPath);
    WizardUI.warning('Note: API keys have been hidden in the export file');
  } catch (error) {
    WizardUI.error('Export failed', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function importConfiguration(file: string): Promise<void> {
  try {
    const importPath = path.resolve(file);
    
    if (!await fs.pathExists(importPath)) {
      WizardUI.error('Import file not found', importPath);
      return;
    }
    
    const importedConfig = await fs.readJson(importPath);
    const currentConfig = await loadConfig();
    
    // Merge configurations, keeping current sensitive data if imported data is hidden
    const mergedConfig: Config = {
      ...currentConfig,
      ...importedConfig
    };
    
    // Don't overwrite with hidden values
    if (importedConfig.clockifyApiKey === '[HIDDEN]') {
      mergedConfig.clockifyApiKey = currentConfig.clockifyApiKey;
    }
    if (importedConfig.jiraApiKey === '[HIDDEN]') {
      mergedConfig.jiraApiKey = currentConfig.jiraApiKey;
    }
    
    await saveConfig(mergedConfig);
    WizardUI.success('Configuration imported successfully');
    WizardUI.info('Run "clockify-auto config validate" to verify the imported configuration');
  } catch (error) {
    WizardUI.error('Import failed', error instanceof Error ? error.message : 'Unknown error');
  }
}
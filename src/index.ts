#!/usr/bin/env node

import { Command } from '@commander-js/extra-typings';
import { createConfigCommand } from './commands/config';
import { createRunCommand } from './commands/run';
import { createScheduleCommand } from './commands/schedule';
import { createTasksCommand } from './commands/tasks';
import { createSetupCommand } from './commands/setup';

const program = new Command();

program
  .name('clockify-auto')
  .description('Automated Clockify time entry CLI tool')
  .version('1.0.0');

program.addCommand(createSetupCommand());
program.addCommand(createConfigCommand());
program.addCommand(createRunCommand());
program.addCommand(createScheduleCommand());
program.addCommand(createTasksCommand());

program
  .command('info')
  .description('Show configuration and status information')
  .action(async () => {
    await showInfoCommand();
  });

async function showInfoCommand(): Promise<void> {
  const { loadConfig } = await import('./commands/config');
  const { PersistenceService } = await import('./services/persistence');
  const { WizardUI } = await import('./services/wizardUI');
  
  let persistenceService: InstanceType<typeof PersistenceService> | null = null;
  
  try {
    const config = await loadConfig();
    const hasConfig = Object.keys(config).length > 0;
    const hasRequiredConfig = !!(config.clockifyApiKey && config.workspaceId && config.projectId);
    
    WizardUI.showSectionHeader('📋 Clockify Auto CLI Information');
    
    // Configuration Status
    const configSummary = {
      'Clockify API Key': config.clockifyApiKey ? '✓ Configured' : '✗ Not configured',
      'Workspace': config.workspaceId || '✗ Not configured',
      'Project': config.projectId || '✗ Not configured',
      'Jira Base URL': config.jiraBaseUrl || '✗ Not configured (optional)',
      'Jira Email': config.jiraEmail || '✗ Not configured (optional)',
      'Jira API Token': config.jiraApiKey ? '✓ Configured' : '✗ Not configured (optional)',
      'Reports Directory': config.reportDir || '✗ Not configured'
    };
    
    WizardUI.showConfigSummary(configSummary);
    
    // Database Status
    console.log('\n🗄️  Database Information');
    console.log('═'.repeat(50));
    
    persistenceService = new PersistenceService();
    await persistenceService.initialize();
    
    const dbPath = persistenceService.getDatabasePath();
    WizardUI.success('SQLite Database', dbPath);
    
    // Show task statistics
    const tasks = await persistenceService.getTasks();
    WizardUI.info(`${tasks.length} tasks configured`);
    
    if (tasks.length > 0) {
      const currentTask = await persistenceService.getCurrentTask();
      if (currentTask) {
        WizardUI.info('Current task for today', currentTask.description);
      } else {
        WizardUI.warning('No task scheduled for today');
      }
    }
    
    console.log('═'.repeat(50));
    
    // Show next steps based on configuration state
    if (!hasConfig) {
      WizardUI.showInfoBox(
        '🚀 Getting Started',
        'No configuration found. Run the setup wizard to get started:',
        ['clockify-auto setup']
      );
    } else if (!hasRequiredConfig) {
      WizardUI.showInfoBox(
        '⚠️  Incomplete Configuration',
        'Some required settings are missing. Complete your setup:',
        [
          'clockify-auto setup (run setup wizard)',
          'clockify-auto config validate (check configuration)',
          'clockify-auto config wizard (reconfigure)'
        ]
      );
    } else {
      WizardUI.showInfoBox(
        '✅ Ready to Use',
        'Your configuration looks good! Here\'s what you can do:',
        [
          'clockify-auto run (start time tracking)',
          'clockify-auto tasks list (view tasks)',
          'clockify-auto config validate (test connections)',
          'clockify-auto schedule enable (enable automatic scheduling)'
        ]
      );
    }
    
  } catch (error) {
    WizardUI.error('Error getting system information', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    if (persistenceService) {
      await persistenceService.close();
    }
  }
}

async function checkFirstRun(): Promise<void> {
  const { loadConfig } = await import('./commands/config');
  const { WizardUI } = await import('./services/wizardUI');
  const { runSetupWizard } = await import('./commands/setup');
  
  try {
    const config = await loadConfig();
    const hasMinimumConfig = !!(config.clockifyApiKey && config.workspaceId && config.projectId);
    
    if (!hasMinimumConfig) {
      console.log('\n👋 Welcome to Clockify Auto CLI!\n');
      
      WizardUI.showInfoBox(
        'First-Time Setup Required',
        'It looks like this is your first time using Clockify Auto CLI. Let\'s get you set up!',
        [
          'We\'ll configure your Clockify API connection',
          'Optionally set up Jira integration',
          'Configure PDF report generation',
          'Test everything to make sure it works'
        ]
      );
      
      // Import inquirer dynamically
      const inquirer = (await import('inquirer')).default;
      
      const { runSetup } = await inquirer.prompt([{
        type: 'confirm',
        name: 'runSetup',
        message: 'Would you like to run the setup wizard now?',
        default: true
      }]);
      
      if (runSetup) {
        await runSetupWizard();
        return;
      } else {
        WizardUI.info('Setup skipped. You can run "clockify-auto setup" anytime to configure the application.');
      }
    }
  } catch (error) {
    // If there's an error checking first run, just continue silently
    // The user can always run setup manually
  }
}

if (require.main === module) {
  (async () => {
    await checkFirstRun();
    program.parse();
  })();
}

export { program };
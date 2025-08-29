import { Command } from '@commander-js/extra-typings';
import * as cron from 'node-cron';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PM2_PROCESS_NAME = 'clockify-auto-cli';
const PM2_CONFIG_DIR = path.join(os.homedir(), '.clockify-auto-cli');
const PM2_CONFIG_FILE = path.join(PM2_CONFIG_DIR, 'pm2.config.js');

export function createScheduleCommand(): Command {
  const schedule = new Command('schedule')
    .description('Manage scheduling of the daily time entry process');

  schedule
    .command('enable')
    .description('Enable daily scheduling via PM2')
    .action(async () => {
      try {
        await enableScheduling();
      } catch (error) {
        console.error('Error enabling scheduling:', error);
        process.exit(1);
      }
    });

  schedule
    .command('disable')
    .description('Disable daily scheduling')
    .action(async () => {
      try {
        await disableScheduling();
      } catch (error) {
        console.error('Error disabling scheduling:', error);
        process.exit(1);
      }
    });

  schedule
    .command('status')
    .description('Check scheduling status')
    .action(async () => {
      try {
        await checkStatus();
      } catch (error) {
        console.error('Error checking status:', error);
        process.exit(1);
      }
    });

  schedule
    .command('restart')
    .description('Restart the scheduled process')
    .action(async () => {
      try {
        await restartScheduling();
      } catch (error) {
        console.error('Error restarting scheduling:', error);
        process.exit(1);
      }
    });

  return schedule;
}

async function enableScheduling(): Promise<void> {
  console.log('Enabling daily scheduling...');
  
  await ensurePM2Installed();
  await createPM2Config();
  await startPM2Process();
  
  console.log('Scheduling enabled! The process will run daily at 6:00 PM on weekdays.');
  console.log('Use "pm2 startup" to ensure the process survives system restarts.');
}

async function disableScheduling(): Promise<void> {
  console.log('Disabling scheduling...');
  
  try {
    await execAsync(`pm2 delete ${PM2_PROCESS_NAME}`);
    console.log('Scheduling disabled successfully.');
  } catch (error) {
    console.log('Process was not running or already disabled.');
  }
}

async function checkStatus(): Promise<void> {
  try {
    const { stdout } = await execAsync(`pm2 list | grep ${PM2_PROCESS_NAME}`);
    if (stdout.trim()) {
      console.log('Scheduling is enabled and process is running:');
      console.log(stdout);
      
      const { stdout: logs } = await execAsync(`pm2 logs ${PM2_PROCESS_NAME} --lines 10 --nostream`);
      console.log('\nRecent logs:');
      console.log(logs);
    } else {
      console.log('Scheduling is disabled.');
    }
  } catch (error) {
    console.log('Scheduling is disabled or PM2 is not installed.');
  }
}

async function restartScheduling(): Promise<void> {
  console.log('Restarting scheduled process...');
  
  try {
    await execAsync(`pm2 restart ${PM2_PROCESS_NAME}`);
    console.log('Process restarted successfully.');
  } catch (error) {
    console.error('Failed to restart process. Trying to start fresh...');
    await enableScheduling();
  }
}

async function ensurePM2Installed(): Promise<void> {
  try {
    await execAsync('pm2 --version');
  } catch (error) {
    throw new Error('PM2 is not installed. Please install it globally: npm install -g pm2');
  }
}

async function createPM2Config(): Promise<void> {
  await fs.ensureDir(PM2_CONFIG_DIR);
  
  const configContent = `
module.exports = {
  apps: [{
    name: '${PM2_PROCESS_NAME}',
    script: 'node',
    args: ['-e', \`
      const cron = require('node-cron');
      const { exec } = require('child_process');
      
      console.log('Clockify Auto CLI Scheduler started');
      
      // Run at 6:00 PM on weekdays
      cron.schedule('0 18 * * 1-5', () => {
        console.log('Starting scheduled Clockify auto-fill...');
        
        exec('clockify-auto run', (error, stdout, stderr) => {
          if (error) {
            console.error('Error:', error);
            return;
          }
          console.log(stdout);
          if (stderr) console.error(stderr);
        });
      });
      
      // Keep the process alive
      process.on('SIGINT', () => {
        console.log('Scheduler stopped');
        process.exit(0);
      });
    \`],
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
`;
  
  await fs.writeFile(PM2_CONFIG_FILE, configContent);
}

async function startPM2Process(): Promise<void> {
  try {
    await execAsync(`pm2 delete ${PM2_PROCESS_NAME}`);
  } catch (error) {
    // Process might not exist, ignore error
  }
  
  await execAsync(`pm2 start ${PM2_CONFIG_FILE}`);
  await execAsync(`pm2 save`);
}

export function startScheduler(): void {
  console.log('Starting scheduler...');
  
  cron.schedule('0 18 * * 1-5', () => {
    console.log('Running scheduled Clockify auto-fill...');
    
    const { spawn } = require('child_process');
    const child = spawn('node', [path.join(__dirname, '../index.js'), 'run'], {
      stdio: 'inherit'
    });
    
    child.on('error', (error: Error) => {
      console.error('Scheduler error:', error);
    });
    
    child.on('close', (code: number) => {
      console.log(`Scheduled run completed with code ${code}`);
    });
  });
  
  console.log('Scheduler is running. Will execute at 6:00 PM on weekdays.');
  
  process.on('SIGINT', () => {
    console.log('Scheduler stopped');
    process.exit(0);
  });
}
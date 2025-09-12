import { Command } from '@commander-js/extra-typings';
import * as cron from 'node-cron';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { exec, spawn } from 'child_process';
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

  schedule
    .command('set-time')
    .description('Set the schedule time (format: HH:mm)')
    .argument('<time>', 'Time in HH:mm format (e.g., "18:00")')
    .action(async (time: string) => {
      try {
        await setScheduleTime(time);
      } catch (error) {
        console.error('Error setting schedule time:', error);
        process.exit(1);
      }
    });

  schedule
    .command('set-days')
    .description('Set the schedule days (0=Sunday, 1=Monday, etc.)')
    .argument('<days>', 'Comma-separated day numbers (e.g., "1,2,3,4,5" for weekdays)')
    .action(async (days: string) => {
      try {
        await setScheduleDays(days);
      } catch (error) {
        console.error('Error setting schedule days:', error);
        process.exit(1);
      }
    });

  schedule
    .command('show-config')
    .description('Show current schedule configuration')
    .action(async () => {
      try {
        await showScheduleConfig();
      } catch (error) {
        console.error('Error showing schedule config:', error);
        process.exit(1);
      }
    });

  schedule
    .command('history')
    .description('Show schedule execution history and missed runs')
    .action(async () => {
      try {
        await showScheduleHistory();
      } catch (error) {
        console.error('Error showing schedule history:', error);
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
  } catch {
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
  } catch {
    console.log('Scheduling is disabled or PM2 is not installed.');
  }
}

async function restartScheduling(): Promise<void> {
  console.log('Restarting scheduled process...');
  
  try {
    await execAsync(`pm2 restart ${PM2_PROCESS_NAME}`);
    console.log('Process restarted successfully.');
  } catch {
    console.error('Failed to restart process. Trying to start fresh...');
    await enableScheduling();
  }
}

async function ensurePM2Installed(): Promise<void> {
  try {
    await execAsync('pm2 --version');
  } catch {
    throw new Error('PM2 is not installed. Please install it globally: npm install -g pm2');
  }
}

async function createPM2Config(): Promise<void> {
  await fs.ensureDir(PM2_CONFIG_DIR);
  
  // Create a standalone scheduler script
  const schedulerScript = path.join(PM2_CONFIG_DIR, 'scheduler.js');
  const schedulerContent = `
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Enhanced logging function
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [\${level}] \${message}\`);
}

// Load configuration
function loadConfig() {
  try {
    const configPath = path.join(os.homedir(), '.clockify-auto-cli', 'config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    log(\`Warning: Could not load config (\${error.message}). Using defaults.\`, 'WARN');
    return {};
  }
}

// State file for tracking last execution
const STATE_FILE = path.join(os.homedir(), '.clockify-auto-cli', 'scheduler-state.json');

// Load scheduler state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stateData = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(stateData);
    }
  } catch (error) {
    log(\`Warning: Could not load state (\${error.message}). Starting fresh.\`, 'WARN');
  }
  return { lastRun: null, missedRuns: [] };
}

// Save scheduler state
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    log(\`Error saving state: \${error.message}\`, 'ERROR');
  }
}

// Get today's date string in YYYY-MM-DD format
function getDateString(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// Check if we should run today (based on schedule)
function shouldRunToday(scheduleDays, date = new Date()) {
  return scheduleDays.includes(date.getDay());
}

// Check if the scheduled time has passed today
function hasScheduledTimePassed(scheduleTime, date = new Date()) {
  const [targetHour, targetMinute] = scheduleTime.split(':').map(Number);
  const currentHour = date.getHours();
  const currentMinute = date.getMinutes();
  
  return (currentHour > targetHour) || (currentHour === targetHour && currentMinute > targetMinute);
}

// Check for missed runs and execute if needed
function checkForMissedRuns() {
  const config = loadConfig();
  const scheduleTime = config.scheduleTime || '18:00';
  const scheduleDays = config.scheduleDays || [1, 2, 3, 4, 5];
  const state = loadState();
  
  const today = getDateString();
  const now = new Date();
  
  // Check if we should run today and the scheduled time has passed
  const shouldRunTodayFlag = shouldRunToday(scheduleDays, now);
  const timeHasPassed = hasScheduledTimePassed(scheduleTime, now);
  
  if (shouldRunTodayFlag && timeHasPassed) {
    // Check if we already ran today
    if (state.lastRun !== today) {
      log(\`Detected missed run for \${today} (scheduled for \${scheduleTime}). Executing catch-up run.\`, 'INFO');
      
      // Update state before running to prevent duplicate runs
      state.lastRun = today;
      state.missedRuns = state.missedRuns || [];
      state.missedRuns.push({
        date: today,
        scheduledTime: scheduleTime,
        executedTime: new Date().toISOString(),
        reason: 'catch-up'
      });
      
      // Keep only last 30 days of missed run history
      if (state.missedRuns.length > 30) {
        state.missedRuns = state.missedRuns.slice(-30);
      }
      
      saveState(state);
      runClockifyAuto('catch-up');
      return true;
    }
  }
  
  return false;
}

log('Clockify Auto CLI Scheduler started');

// Function to run the clockify command
function runClockifyAuto(reason = 'scheduled') {
  log(\`Starting \${reason} Clockify auto-fill...\`, 'INFO');
  
  const child = spawn('clockify-auto', ['run'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  child.stdout.on('data', (data) => {
    log(\`STDOUT: \${data.toString().trim()}\`, 'INFO');
  });
  
  child.stderr.on('data', (data) => {
    log(\`STDERR: \${data.toString().trim()}\`, 'WARN');
  });
  
  child.on('error', (error) => {
    log(\`Error running clockify-auto: \${error.message}\`, 'ERROR');
  });
  
  child.on('exit', (code, signal) => {
    if (code === 0) {
      log(\`clockify-auto run completed successfully (exit code: \${code})\`, 'INFO');
      
      // Update state on successful run
      if (reason === 'scheduled') {
        const state = loadState();
        state.lastRun = getDateString();
        saveState(state);
      }
    } else {
      log(\`clockify-auto run failed with exit code: \${code}, signal: \${signal}\`, 'ERROR');
    }
  });
}

// Parse time string to hours and minutes
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

// Simple cron-like scheduler using setInterval
function scheduleDaily() {
  const config = loadConfig();
  const scheduleTime = config.scheduleTime || '18:00'; // Default to 6:00 PM
  const scheduleDays = config.scheduleDays || [1, 2, 3, 4, 5]; // Default to weekdays
  
  const { hours: targetHour, minutes: targetMinute } = parseTime(scheduleTime);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const scheduledDayNames = scheduleDays.map(day => dayNames[day]).join(', ');
  
  log(\`Setting up schedule: \${scheduleTime} on \${scheduledDayNames}\`, 'INFO');
  
  // Check for missed runs immediately on startup
  const missedRunExecuted = checkForMissedRuns();
  if (missedRunExecuted) {
    log('Catch-up run executed on startup', 'INFO');
  }
  
  function checkTime() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // Log current time check (only at the top of each hour to reduce noise)
    if (minute === 0) {
      const dayName = dayNames[day];
      log(\`Time check: \${dayName} \${hour}:00 (target: \${scheduledDayNames} \${scheduleTime})\`, 'DEBUG');
    }
    
    // Check if current day is in scheduled days and time matches exactly
    if (scheduleDays.includes(day) && hour === targetHour && minute === targetMinute) {
      const dayName = dayNames[day];
      const today = getDateString();
      const state = loadState();
      
      // Prevent duplicate runs on the same day
      if (state.lastRun === today) {
        log(\`Already executed today (\${today}). Skipping duplicate run.\`, 'INFO');
        return;
      }
      
      log(\`Triggering scheduled run on \${dayName} at \${scheduleTime}\`, 'INFO');
      runClockifyAuto('scheduled');
    }
  }
  
  // Check every minute
  const interval = setInterval(checkTime, 60000);
  log('Scheduler interval set to check every minute', 'INFO');
  
  // Also check immediately in case we're starting at the right time
  checkTime();
  
  return interval;
}

// Start the scheduler
const schedulerInterval = scheduleDaily();

// Graceful shutdown handlers
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down scheduler...', 'INFO');
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    log('Scheduler interval cleared', 'INFO');
  }
  log('Scheduler stopped gracefully', 'INFO');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down scheduler...', 'INFO');
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    log('Scheduler interval cleared', 'INFO');
  }
  log('Scheduler terminated gracefully', 'INFO');
  process.exit(0);
});

// Log process info
log(\`Scheduler process started with PID: \${process.pid}\`, 'INFO');
log(\`Node.js version: \${process.version}\`, 'INFO');
log(\`Working directory: \${process.cwd()}\`, 'INFO');

// Check for missed runs every hour (in addition to startup check)
setInterval(() => {
  checkForMissedRuns();
}, 3600000); // Every hour

// Periodic health check
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.rss / 1024 / 1024);
  log(\`Health check - Memory usage: \${memMB}MB, Uptime: \${Math.round(process.uptime())}s\`, 'DEBUG');
}, 3600000); // Every hour
`;
  
  await fs.writeFile(schedulerScript, schedulerContent);
  
  // Create PM2 config that uses the standalone script
  const configContent = `
module.exports = {
  apps: [{
    name: '${PM2_PROCESS_NAME}',
    script: '${schedulerScript}',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '${path.join(PM2_CONFIG_DIR, 'scheduler-error.log')}',
    out_file: '${path.join(PM2_CONFIG_DIR, 'scheduler-out.log')}',
    log_file: '${path.join(PM2_CONFIG_DIR, 'scheduler.log')}',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
`;
  
  await fs.writeFile(PM2_CONFIG_FILE, configContent);
}

async function startPM2Process(): Promise<void> {
  try {
    await execAsync(`pm2 delete ${PM2_PROCESS_NAME}`);
  } catch {
    // Process might not exist, ignore error
  }
  
  await execAsync(`pm2 start ${PM2_CONFIG_FILE}`);
  await execAsync(`pm2 save`);
}

async function setScheduleTime(time: string): Promise<void> {
  // Import loadConfig and saveConfig dynamically to avoid circular imports
  const { loadConfig, saveConfig } = await import('./config');
  
  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(time)) {
    throw new Error('Invalid time format. Use HH:mm format (e.g., "18:00")');
  }
  
  const config = await loadConfig();
  config.scheduleTime = time;
  await saveConfig(config);
  
  console.log(`Schedule time set to ${time}`);
  console.log('Note: You need to restart the scheduler for changes to take effect.');
  console.log('Run: clockify-auto schedule restart');
}

async function setScheduleDays(days: string): Promise<void> {
  // Import loadConfig and saveConfig dynamically to avoid circular imports
  const { loadConfig, saveConfig } = await import('./config');
  
  // Parse and validate days
  const dayNumbers = days.split(',').map(d => parseInt(d.trim(), 10));
  if (dayNumbers.some(day => isNaN(day) || day < 0 || day > 6)) {
    throw new Error('Invalid day numbers. Use 0-6 (0=Sunday, 1=Monday, etc.)');
  }
  
  const config = await loadConfig();
  config.scheduleDays = dayNumbers;
  await saveConfig(config);
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const selectedDays = dayNumbers.map(day => dayNames[day]).join(', ');
  
  console.log(`Schedule days set to: ${selectedDays}`);
  console.log('Note: You need to restart the scheduler for changes to take effect.');
  console.log('Run: clockify-auto schedule restart');
}

async function showScheduleConfig(): Promise<void> {
  // Import loadConfig dynamically to avoid circular imports
  const { loadConfig } = await import('./config');
  
  const config = await loadConfig();
  const scheduleTime = config.scheduleTime || '18:00';
  const scheduleDays = config.scheduleDays || [1, 2, 3, 4, 5];
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const selectedDays = scheduleDays.map(day => dayNames[day]).join(', ');
  
  console.log('Current schedule configuration:');
  console.log(`  Time: ${scheduleTime}`);
  console.log(`  Days: ${selectedDays}`);
  console.log('');
  console.log('To change:');
  console.log('  clockify-auto schedule set-time <HH:mm>');
  console.log('  clockify-auto schedule set-days <comma-separated-day-numbers>');
  console.log('  clockify-auto schedule restart  (to apply changes)');
}

async function showScheduleHistory(): Promise<void> {
  const stateFile = path.join(PM2_CONFIG_DIR, 'scheduler-state.json');
  
  try {
    if (!await fs.pathExists(stateFile)) {
      console.log('No schedule history available yet.');
      console.log('The scheduler will create history once it starts running.');
      return;
    }
    
    const stateData = await fs.readFile(stateFile, 'utf8');
    const state = JSON.parse(stateData);
    
    console.log('Schedule Execution History:');
    console.log('');
    
    // Show last run
    if (state.lastRun) {
      console.log(`Last successful run: ${state.lastRun}`);
    } else {
      console.log('No successful runs recorded yet.');
    }
    
    console.log('');
    
    // Show missed runs (catch-up executions)
    if (state.missedRuns && state.missedRuns.length > 0) {
      console.log('Recent catch-up runs (missed schedules):');
      console.log('');
      
      state.missedRuns
        .slice(-10) // Show last 10
        .forEach((missed: any) => {
          const executedDate = new Date(missed.executedTime);
          console.log(`  ${missed.date}: Scheduled for ${missed.scheduledTime}, executed at ${executedDate.toLocaleTimeString()} (${missed.reason})`);
        });
        
      if (state.missedRuns.length > 10) {
        console.log(`  ... and ${state.missedRuns.length - 10} more`);
      }
    } else {
      console.log('No catch-up runs needed (no missed schedules).');
    }
    
    console.log('');
    console.log('Note: Catch-up runs occur when the computer was powered off during scheduled time.');
    
  } catch (error) {
    console.error('Error reading schedule history:', error);
  }
}
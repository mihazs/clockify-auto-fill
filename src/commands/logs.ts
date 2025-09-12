import { Command } from '@commander-js/extra-typings';
import { readFile, access } from 'fs/promises';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

const LOG_DIR = path.join(os.homedir(), '.clockify-auto-cli');
const LOG_FILES = {
  scheduler: 'scheduler-out.log',
  error: 'scheduler-error.log', 
  combined: 'scheduler.log'
};

export function createLogsCommand(): Command {
  const logs = new Command('logs')
    .description('View application logs');

  logs
    .command('show')
    .description('Show recent log entries')
    .option('-t, --type <type>', 'Log type (scheduler, error, combined)', 'scheduler')
    .option('-l, --lines <number>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output (tail -f)')
    .action(async (options) => {
      await showLogs(options.type, parseInt(options.lines), !!options.follow);
    });

  logs
    .command('clear')
    .description('Clear all log files')
    .option('--type <type>', 'Specific log type to clear (scheduler, error, combined, or all)', 'all')
    .action(async (options) => {
      await clearLogs(options.type);
    });

  logs
    .command('path')
    .description('Show log file paths')
    .action(async () => {
      console.log('📁 Log file locations:');
      console.log(`  Scheduler logs: ${path.join(LOG_DIR, LOG_FILES.scheduler)}`);
      console.log(`  Error logs:     ${path.join(LOG_DIR, LOG_FILES.error)}`);
      console.log(`  Combined logs:  ${path.join(LOG_DIR, LOG_FILES.combined)}`);
      console.log(`  Log directory:  ${LOG_DIR}`);
    });

  // Default action - show recent scheduler logs
  logs.action(async () => {
    await showLogs('scheduler', 50, false);
  });

  return logs;
}

async function showLogs(type: string, lines: number, follow: boolean): Promise<void> {
  const logTypes = Object.keys(LOG_FILES) as (keyof typeof LOG_FILES)[];
  
  if (!logTypes.includes(type as keyof typeof LOG_FILES)) {
    console.error(`❌ Invalid log type: ${type}`);
    console.error(`Available types: ${logTypes.join(', ')}`);
    return;
  }

  const logFile = path.join(LOG_DIR, LOG_FILES[type as keyof typeof LOG_FILES]);

  // Check if log file exists
  try {
    await access(logFile);
  } catch {
    console.log(`📝 No ${type} logs found at: ${logFile}`);
    console.log('💡 Logs will be created when the scheduler runs.');
    return;
  }

  if (follow) {
    console.log(`📊 Following ${type} logs (Ctrl+C to stop):`);
    console.log('─'.repeat(80));
    
    // Use tail -f for following logs
    const tailProcess = spawn('tail', ['-f', '-n', lines.toString(), logFile], {
      stdio: 'inherit'
    });

    // Handle process termination
    process.on('SIGINT', () => {
      tailProcess.kill();
      console.log('\n👋 Stopped following logs.');
      process.exit(0);
    });

    tailProcess.on('error', (error) => {
      console.error(`❌ Error following logs: ${error.message}`);
      console.log('💡 Trying to read file directly...');
      showLogsDirectly(logFile, lines);
    });

  } else {
    console.log(`📊 Recent ${type} logs (${lines} lines):`);
    console.log('─'.repeat(80));
    await showLogsDirectly(logFile, lines);
  }
}

async function showLogsDirectly(logFile: string, lines: number): Promise<void> {
  try {
    const content = await readFile(logFile, 'utf-8');
    const logLines = content.trim().split('\n');
    
    if (logLines.length === 0 || (logLines.length === 1 && logLines[0] === '')) {
      console.log('📝 Log file is empty.');
      return;
    }

    const startIndex = Math.max(0, logLines.length - lines);
    const recentLines = logLines.slice(startIndex);
    
    recentLines.forEach(line => {
      if (line.trim()) {
        // Color-code log levels
        let coloredLine = line;
        if (line.includes('[INFO]')) {
          coloredLine = line.replace('[INFO]', '\x1b[32m[INFO]\x1b[0m'); // Green
        } else if (line.includes('[ERROR]')) {
          coloredLine = line.replace('[ERROR]', '\x1b[31m[ERROR]\x1b[0m'); // Red
        } else if (line.includes('[WARN]')) {
          coloredLine = line.replace('[WARN]', '\x1b[33m[WARN]\x1b[0m'); // Yellow
        }
        console.log(coloredLine);
      }
    });

    console.log('─'.repeat(80));
    console.log(`📊 Showing ${recentLines.length} of ${logLines.length} total log entries`);
    
  } catch (error) {
    console.error(`❌ Error reading log file: ${error}`);
  }
}

async function clearLogs(type: string): Promise<void> {
  const logTypes = [...Object.keys(LOG_FILES), 'all'];
  
  if (!logTypes.includes(type)) {
    console.error(`❌ Invalid log type: ${type}`);
    console.error(`Available types: ${logTypes.join(', ')}`);
    return;
  }

  const filesToClear = type === 'all' 
    ? Object.values(LOG_FILES)
    : [LOG_FILES[type as keyof typeof LOG_FILES]];

  console.log(`🧹 Clearing ${type} logs...`);

  for (const file of filesToClear) {
    const logFile = path.join(LOG_DIR, file);
    try {
      await access(logFile);
      // Clear file by writing empty content
      const { writeFile } = await import('fs/promises');
      await writeFile(logFile, '');
      console.log(`✅ Cleared: ${file}`);
    } catch {
      console.log(`ℹ️  File not found (already empty): ${file}`);
    }
  }

  console.log('🎉 Log clearing completed!');
}
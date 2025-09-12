import { Command } from '@commander-js/extra-typings';
import { PersistenceService } from '../services/persistence';
import { loadConfig } from './config';
import dayjs from 'dayjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { calculateMonthlyFinancialInfo, formatCurrency, formatHours } from '../utils/financialUtils';

interface AnalyticsData {
  timeEntries: {
    totalEntries: number;
    totalDays: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
    dateRange: {
      start: string;
      end: string;
    };
    byWeekday: Record<string, { count: number; totalMinutes: number }>;
    byMonth: Record<string, { count: number; totalMinutes: number }>;
    mostUsedDescriptions: Array<{ description: string; count: number; totalMinutes: number }>;
  };
  tasks: {
    totalTasks: number;
    activeDays: number;
    taskTypes: Record<string, { count: number; days: number }>;
    averageTaskDuration: number;
    currentTask: string | null;
  };
  scheduler: {
    totalLogs: number;
    successfulRuns: number;
    catchupRuns: number;
    errors: number;
    lastRun: string | null;
    uptime: {
      totalStarts: number;
      avgSessionDuration: string;
    };
  };
  financial?: {
    hourlyRate: number;
    thisMonth: {
      hoursWorked: number;
      expectedHours: number;
      remunerationSoFar: number;
      expectedRemuneration: number;
      projectedRemuneration: number;
      workingDaysTotal: number;
      workingDaysPassed: number;
      workingDaysRemaining: number;
      averageHoursPerDay: number;
      monthName: string;
      isComplete: boolean;
    };
    totalEarnings: number;
  };
}

interface DateRange {
  start: string;
  end: string;
  description: string;
}

function calculateDateRange(days?: string, from?: string, to?: string): DateRange {
  let startDate: dayjs.Dayjs;
  let endDate: dayjs.Dayjs;
  let description: string;

  // End date: use 'to' parameter, or default to today
  endDate = to ? dayjs(to) : dayjs();

  // Start date logic
  if (days) {
    // If days is specified, count backwards from end date
    const daysNum = parseInt(days);
    startDate = endDate.subtract(daysNum - 1, 'days');
    description = `Last ${daysNum} days`;
  } else if (from) {
    // If from is specified, use it
    startDate = dayjs(from);
    description = `${from} to ${endDate.format('YYYY-MM-DD')}`;
  } else {
    // Default: first day of current month to today (month-to-date)
    startDate = endDate.startOf('month');
    description = `Month-to-date (${startDate.format('MMM YYYY')})`;
  }

  return {
    start: startDate.format('YYYY-MM-DD'),
    end: endDate.format('YYYY-MM-DD'),
    description
  };
}

export function createAnalyticsCommand(): Command {
  const analytics = new Command('analytics')
    .description('Generate analytics reports for time tracking and scheduler activity');

  analytics
    .command('summary')
    .description('Show summary analytics')
    .option('--days <number>', 'Number of days to analyze (from today backwards)')
    .option('--from <date>', 'Start date (YYYY-MM-DD). Default: first day of current month')
    .option('--to <date>', 'End date (YYYY-MM-DD). Default: today')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .action(async (options) => {
      const dateRange = calculateDateRange(options.days, options.from, options.to);
      await showSummaryAnalytics(dateRange, options.format);
    });

  analytics
    .command('time')
    .description('Detailed time tracking analytics')
    .option('--days <number>', 'Number of days to analyze (from today backwards)')
    .option('--from <date>', 'Start date (YYYY-MM-DD). Default: first day of current month')
    .option('--to <date>', 'End date (YYYY-MM-DD). Default: today')
    .option('--export <file>', 'Export to CSV file')
    .action(async (options) => {
      const dateRange = calculateDateRange(options.days, options.from, options.to);
      await showTimeAnalytics(dateRange, options.export);
    });

  analytics
    .command('tasks')
    .description('Task and project analytics')
    .option('--days <number>', 'Number of days to analyze (from today backwards)')
    .option('--from <date>', 'Start date (YYYY-MM-DD). Default: first day of current month')
    .option('--to <date>', 'End date (YYYY-MM-DD). Default: today')
    .action(async (options) => {
      const dateRange = calculateDateRange(options.days, options.from, options.to);
      await showTaskAnalytics(dateRange);
    });

  analytics
    .command('scheduler')
    .description('Scheduler performance analytics')
    .action(async () => {
      await showSchedulerAnalytics();
    });

  // Default action - show summary (month-to-date)
  analytics.action(async () => {
    const dateRange = calculateDateRange(undefined, undefined, undefined);
    await showSummaryAnalytics(dateRange, 'text');
  });

  return analytics;
}

async function gatherAnalyticsData(dateRange: DateRange): Promise<AnalyticsData> {
  const persistenceService = new PersistenceService();
  await persistenceService.initialize();

  try {
    const config = await loadConfig();
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    // Get time entries
    const timeEntries = await persistenceService.getTimeEntriesInRange(startDate, endDate);
    const tasks = await persistenceService.getTasksInDateRange(startDate, endDate);
    const currentTask = await persistenceService.getCurrentTask();

    // Calculate time entry analytics
    const totalDurationMinutes = timeEntries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
    const uniqueDays = new Set(timeEntries.map(entry => entry.date)).size;

    // Group by weekday
    const byWeekday: Record<string, { count: number; totalMinutes: number }> = {};
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    timeEntries.forEach(entry => {
      const weekday = weekdays[dayjs(entry.date).day()];
      if (!byWeekday[weekday]) {
        byWeekday[weekday] = { count: 0, totalMinutes: 0 };
      }
      byWeekday[weekday].count++;
      byWeekday[weekday].totalMinutes += entry.durationMinutes || 0;
    });

    // Group by month
    const byMonth: Record<string, { count: number; totalMinutes: number }> = {};
    timeEntries.forEach(entry => {
      const month = dayjs(entry.date).format('YYYY-MM');
      if (!byMonth[month]) {
        byMonth[month] = { count: 0, totalMinutes: 0 };
      }
      byMonth[month].count++;
      byMonth[month].totalMinutes += entry.durationMinutes || 0;
    });

    // Most used descriptions
    const descriptionStats: Record<string, { count: number; totalMinutes: number }> = {};
    timeEntries.forEach(entry => {
      if (!descriptionStats[entry.description]) {
        descriptionStats[entry.description] = { count: 0, totalMinutes: 0 };
      }
      descriptionStats[entry.description].count++;
      descriptionStats[entry.description].totalMinutes += entry.durationMinutes || 0;
    });

    const mostUsedDescriptions = Object.entries(descriptionStats)
      .map(([description, stats]) => ({ description, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Task analytics
    const taskTypes: Record<string, { count: number; days: number }> = {};
    const taskDays = new Set<string>();

    tasks.forEach(task => {
      if (!taskTypes[task.description]) {
        taskTypes[task.description] = { count: 0, days: 0 };
      }
      taskTypes[task.description].count++;
      
      // Calculate days for this task
      const start = dayjs(task.startDate);
      const end = task.endDate ? dayjs(task.endDate) : dayjs();
      const taskDayCount = end.diff(start, 'day') + 1;
      taskTypes[task.description].days += taskDayCount;
      
      for (let i = 0; i < taskDayCount; i++) {
        taskDays.add(start.add(i, 'day').format('YYYY-MM-DD'));
      }
    });

    const averageTaskDuration = tasks.length > 0 
      ? tasks.reduce((sum, task) => {
          const start = dayjs(task.startDate);
          const end = task.endDate ? dayjs(task.endDate) : dayjs();
          return sum + end.diff(start, 'day') + 1;
        }, 0) / tasks.length
      : 0;

    // Scheduler analytics
    const schedulerAnalytics = await gatherSchedulerAnalytics();

    // Financial analytics (if hourly rate is configured)
    let financial = undefined;
    if (config.hourlyRate && config.hourlyRate > 0) {
      // Get current month's time entries
      const currentMonthStart = dayjs().startOf('month').format('YYYY-MM-DD');
      const currentMonthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
      const currentMonthEntries = await persistenceService.getTimeEntriesInRange(currentMonthStart, currentMonthEnd);
      
      const hoursWorkedThisMonth = currentMonthEntries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0) / 60;
      const totalEarnings = totalDurationMinutes / 60 * config.hourlyRate;
      
      // Calculate expected work hours based on default working hours (8h/day)
      let defaultHoursPerDay = 8;
      if (config.defaultStartTime && config.defaultEndTime) {
        const startTime = dayjs(`2000-01-01 ${config.defaultStartTime}`);
        const endTime = dayjs(`2000-01-01 ${config.defaultEndTime}`);
        const configuredHoursPerDay = endTime.diff(startTime, 'hours', true);
        if (configuredHoursPerDay > 0) {
          defaultHoursPerDay = configuredHoursPerDay;
        }
      }
      
      const financialInfo = calculateMonthlyFinancialInfo(config.hourlyRate, hoursWorkedThisMonth, defaultHoursPerDay);
      
      financial = {
        hourlyRate: config.hourlyRate,
        thisMonth: {
          hoursWorked: financialInfo.hoursWorkedSoFar,
          expectedHours: financialInfo.expectedWorkHours,
          remunerationSoFar: financialInfo.remunerationSoFar,
          expectedRemuneration: financialInfo.expectedRemuneration,
          projectedRemuneration: financialInfo.projectedRemuneration,
          workingDaysTotal: financialInfo.workingDaysTotal,
          workingDaysPassed: financialInfo.workingDaysPassed,
          workingDaysRemaining: financialInfo.workingDaysRemaining,
          averageHoursPerDay: financialInfo.averageHoursPerDay,
          monthName: financialInfo.currentMonth.name,
          isComplete: financialInfo.isMonthComplete
        },
        totalEarnings
      };
    }

    return {
      timeEntries: {
        totalEntries: timeEntries.length,
        totalDays: uniqueDays,
        totalDurationMinutes,
        averageDurationMinutes: timeEntries.length > 0 ? totalDurationMinutes / timeEntries.length : 0,
        dateRange: {
          start: startDate,
          end: endDate
        },
        byWeekday,
        byMonth,
        mostUsedDescriptions
      },
      tasks: {
        totalTasks: tasks.length,
        activeDays: taskDays.size,
        taskTypes,
        averageTaskDuration,
        currentTask: currentTask?.description || null
      },
      scheduler: schedulerAnalytics,
      financial
    };

  } finally {
    await persistenceService.close();
  }
}

async function gatherSchedulerAnalytics() {
  const logFile = path.join(os.homedir(), '.clockify-auto-cli', 'scheduler-out.log');
  
  try {
    const logContent = await fs.readFile(logFile, 'utf-8');
    const logLines = logContent.trim().split('\n').filter(line => line.trim());

    const successfulRuns = logLines.filter(line => 
      line.includes('clockify-auto run completed successfully')).length;
    
    const catchupRuns = logLines.filter(line => 
      line.includes('Detected missed run') || line.includes('Executing catch-up run')).length;
    
    const errors = logLines.filter(line => 
      line.includes('[ERROR]')).length;
    
    const starts = logLines.filter(line => 
      line.includes('Clockify Auto CLI Scheduler started')).length;

    const lastRunMatch = logLines
      .reverse()
      .find(line => line.includes('clockify-auto run completed successfully'));
    
    const lastRun = lastRunMatch ? 
      lastRunMatch.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || null : null;

    return {
      totalLogs: logLines.length,
      successfulRuns,
      catchupRuns,
      errors,
      lastRun,
      uptime: {
        totalStarts: starts,
        avgSessionDuration: 'N/A' // Complex to calculate without tracking shutdown times
      }
    };
  } catch (error) {
    return {
      totalLogs: 0,
      successfulRuns: 0,
      catchupRuns: 0,
      errors: 0,
      lastRun: null,
      uptime: {
        totalStarts: 0,
        avgSessionDuration: 'N/A'
      }
    };
  }
}

async function showSummaryAnalytics(dateRange: DateRange, format: string): Promise<void> {
  console.log('📊 Gathering analytics data...');
  
  const data = await gatherAnalyticsData(dateRange);
  
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Calculate period duration
  const periodDays = dayjs(dateRange.end).diff(dayjs(dateRange.start), 'day') + 1;

  // Text format
  console.log('\n📈 Analytics Summary');
  console.log('═'.repeat(60));
  console.log(`📅 Period: ${dateRange.description}`);
  console.log(`    ${data.timeEntries.dateRange.start} to ${data.timeEntries.dateRange.end} (${periodDays} days)`);
  
  // Time tracking summary
  console.log('\n⏰ Time Tracking:');
  console.log(`  • Total entries: ${data.timeEntries.totalEntries}`);
  console.log(`  • Active days: ${data.timeEntries.totalDays}/${periodDays} (${Math.round(data.timeEntries.totalDays/periodDays*100)}%)`);
  const totalHours = data.timeEntries.totalDurationMinutes / 60;
  console.log(`  • Total time: ${formatHours(totalHours)}`);
  console.log(`  • Average per entry: ${Math.round(data.timeEntries.averageDurationMinutes)} minutes`);
  console.log(`  • Average per day: ${Math.round(data.timeEntries.totalDurationMinutes/data.timeEntries.totalDays)} minutes`);

  // Financial summary (if configured)
  if (data.financial) {
    console.log('\n💰 Financial Summary:');
    console.log(`  • Hourly rate: ${formatCurrency(data.financial.hourlyRate)}`);
    console.log(`  • Period earnings: ${formatCurrency(data.financial.totalEarnings)}`);
    
    console.log('\n📊 This Month:');
    console.log(`  • Month: ${data.financial.thisMonth.monthName}`);
    console.log(`  • Hours worked: ${formatHours(data.financial.thisMonth.hoursWorked)}`);
    console.log(`  • Expected hours: ${formatHours(data.financial.thisMonth.expectedHours)}`);
    console.log(`  • Progress: ${data.financial.thisMonth.workingDaysPassed}/${data.financial.thisMonth.workingDaysTotal} working days`);
    console.log(`  • Remuneration so far: ${formatCurrency(data.financial.thisMonth.remunerationSoFar)}`);
    console.log(`  • Expected total: ${formatCurrency(data.financial.thisMonth.expectedRemuneration)}`);
    
    if (data.financial.thisMonth.projectedRemuneration !== data.financial.thisMonth.expectedRemuneration) {
      const projectedDiff = data.financial.thisMonth.projectedRemuneration - data.financial.thisMonth.expectedRemuneration;
      const projectedSign = projectedDiff >= 0 ? '+' : '';
      console.log(`  • Projected total: ${formatCurrency(data.financial.thisMonth.projectedRemuneration)} (${projectedSign}${formatCurrency(projectedDiff)})`);
    }
    
    if (data.financial.thisMonth.averageHoursPerDay > 0) {
      console.log(`  • Average hours/day: ${formatHours(data.financial.thisMonth.averageHoursPerDay)}`);
    }
  }

  // Task summary
  console.log('\n📋 Tasks:');
  console.log(`  • Total tasks: ${data.tasks.totalTasks}`);
  console.log(`  • Current task: ${data.tasks.currentTask || 'None set'}`);
  console.log(`  • Average task duration: ${Math.round(data.tasks.averageTaskDuration)} days`);

  // Scheduler summary
  console.log('\n🤖 Scheduler:');
  console.log(`  • Successful runs: ${data.scheduler.successfulRuns}`);
  console.log(`  • Catch-up runs: ${data.scheduler.catchupRuns}`);
  console.log(`  • Errors: ${data.scheduler.errors}`);
  console.log(`  • Last run: ${data.scheduler.lastRun || 'No recent runs'}`);

  // Top descriptions
  if (data.timeEntries.mostUsedDescriptions.length > 0) {
    console.log('\n🏆 Most Used Descriptions:');
    data.timeEntries.mostUsedDescriptions.slice(0, 5).forEach((desc, i) => {
      const hours = desc.totalMinutes / 60;
      console.log(`  ${i+1}. ${desc.description} (${desc.count} entries, ${formatHours(hours)})`);
    });
  }

  console.log('\n💡 Use specific commands for detailed analytics:');
  console.log('  • clockify-auto analytics time     # Detailed time analytics');
  console.log('  • clockify-auto analytics tasks    # Task analytics');  
  console.log('  • clockify-auto analytics scheduler # Scheduler analytics');
  
  if (!data.financial) {
    console.log('\n💡 Set hourly rate to see financial analytics:');
    console.log('  • clockify-auto config set hourlyRate 25.50');
  }
}

async function showTimeAnalytics(dateRange: DateRange, exportFile?: string): Promise<void> {
  console.log('📊 Gathering time tracking analytics...');
  
  const data = await gatherAnalyticsData(dateRange);
  
  console.log('\n⏰ Time Tracking Analytics');
  console.log('═'.repeat(60));
  console.log(`📅 Period: ${dateRange.description}`);
  console.log(`    ${data.timeEntries.dateRange.start} to ${data.timeEntries.dateRange.end}`);

  // Weekly pattern
  console.log('\n📊 By Weekday:');
  const sortedWeekdays = Object.entries(data.timeEntries.byWeekday)
    .sort(([,a], [,b]) => b.count - a.count);
  
  sortedWeekdays.forEach(([day, stats]) => {
    const hours = stats.totalMinutes / 60;
    const avgMinutes = stats.count > 0 ? Math.round(stats.totalMinutes / stats.count) : 0;
    console.log(`  • ${day.padEnd(9)}: ${stats.count.toString().padStart(2)} entries, ${formatHours(hours).padStart(8)}, ${avgMinutes}min avg`);
  });

  // Monthly pattern
  console.log('\n📊 By Month:');
  const sortedMonths = Object.entries(data.timeEntries.byMonth)
    .sort(([a], [b]) => a.localeCompare(b));
  
  sortedMonths.forEach(([month, stats]) => {
    const hours = stats.totalMinutes / 60;
    console.log(`  • ${month}: ${stats.count} entries, ${formatHours(hours)}`);
  });

  // Export functionality
  if (exportFile) {
    await exportTimeAnalytics(data, exportFile);
    console.log(`\n💾 Analytics exported to: ${exportFile}`);
  }
}

async function showTaskAnalytics(dateRange: DateRange): Promise<void> {
  console.log('📊 Gathering task analytics...');
  
  const data = await gatherAnalyticsData(dateRange);
  
  console.log('\n📋 Task Analytics');
  console.log('═'.repeat(60));
  console.log(`📅 Period: ${dateRange.description}`);
  console.log(`    ${data.tasks.activeDays} active days in period`);

  console.log('\n📊 Task Types:');
  const sortedTasks = Object.entries(data.tasks.taskTypes)
    .sort(([,a], [,b]) => b.days - a.days);
  
  if (sortedTasks.length === 0) {
    console.log('  No tasks found in the specified period.');
  } else {
    sortedTasks.forEach(([task, stats]) => {
      const truncatedTask = task.length > 50 ? `${task.substring(0, 47)}...` : task;
      console.log(`  • ${truncatedTask}`);
      console.log(`    ${stats.count} task periods, ${stats.days} total days`);
    });
  }

  if (data.tasks.currentTask) {
    console.log(`\n🎯 Current Task: ${data.tasks.currentTask}`);
  }
}

async function showSchedulerAnalytics(): Promise<void> {
  console.log('📊 Gathering scheduler analytics...');
  
  // Always use last 30 days for scheduler analytics
  const dateRange = calculateDateRange('30', undefined, undefined);
  const data = await gatherAnalyticsData(dateRange);
  
  console.log('\n🤖 Scheduler Analytics');
  console.log('═'.repeat(60));

  console.log(`📊 Performance:`);
  console.log(`  • Total log entries: ${data.scheduler.totalLogs}`);
  console.log(`  • Successful runs: ${data.scheduler.successfulRuns}`);
  console.log(`  • Catch-up runs: ${data.scheduler.catchupRuns}`);
  console.log(`  • Errors: ${data.scheduler.errors}`);
  console.log(`  • Scheduler restarts: ${data.scheduler.uptime.totalStarts}`);
  
  if (data.scheduler.successfulRuns > 0) {
    const successRate = Math.round((data.scheduler.successfulRuns / (data.scheduler.successfulRuns + data.scheduler.errors)) * 100);
    console.log(`  • Success rate: ${successRate}%`);
  }

  if (data.scheduler.lastRun) {
    console.log(`  • Last successful run: ${data.scheduler.lastRun}`);
  }

  if (data.scheduler.catchupRuns > 0) {
    console.log(`\n⚡ ${data.scheduler.catchupRuns} catch-up runs detected - system recovered from missed schedules`);
  }
}

async function exportTimeAnalytics(data: AnalyticsData, filename: string): Promise<void> {
  const csvContent = [
    'Metric,Value',
    `Total Entries,${data.timeEntries.totalEntries}`,
    `Total Days,${data.timeEntries.totalDays}`,
    `Total Duration Minutes,${data.timeEntries.totalDurationMinutes}`,
    `Average Duration Minutes,${Math.round(data.timeEntries.averageDurationMinutes)}`,
    '',
    'Most Used Descriptions:',
    'Description,Count,Total Minutes',
    ...data.timeEntries.mostUsedDescriptions.map(desc => 
      `"${desc.description}",${desc.count},${desc.totalMinutes}`
    ),
    '',
    'By Weekday:',
    'Day,Count,Total Minutes',
    ...Object.entries(data.timeEntries.byWeekday).map(([day, stats]) =>
      `${day},${stats.count},${stats.totalMinutes}`
    )
  ].join('\n');

  await fs.writeFile(filename, csvContent);
}
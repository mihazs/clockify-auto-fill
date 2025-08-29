import { Command } from '@commander-js/extra-typings';
import { loadConfig } from './config';
import { ClockifyService } from '../services/clockify';
import { JiraService } from '../services/jira';
import { PersistenceService } from '../services/persistence';
import { PDFService } from '../services/pdf';
import { BusinessDayService } from '../utils/businessDay';
import { getCurrentDate, isLastBusinessDayOfMonth, getPreviousWeekdays, getFirstDayOfMonth, getLastDayOfMonth, getDateRange, isWeekday } from '../utils/dateUtils';
import dayjs from 'dayjs';

export function createRunCommand(): Command {
  const run = new Command('run')
    .description('Execute the daily time entry process');

  run.action(async () => {
    let persistenceService: PersistenceService | null = null;
    
    try {
      console.log('Starting Clockify auto-fill process...');
      
      const config = await loadConfig();
      
      if (!config.clockifyApiKey || !config.workspaceId || !config.projectId) {
        console.error('❌ Clockify configuration is incomplete.');
        console.log('');
        console.log('Missing configuration:');
        if (!config.clockifyApiKey) console.log('  • Clockify API Key');
        if (!config.workspaceId) console.log('  • Workspace ID');  
        if (!config.projectId) console.log('  • Project ID');
        console.log('');
        console.log('🚀 Quick setup options:');
        console.log('  clockify-auto setup     # Interactive setup wizard');
        console.log('  clockify-auto config wizard # Configuration wizard');
        console.log('');
        return;
      }

      const clockifyService = new ClockifyService(config);
      persistenceService = new PersistenceService();
      await persistenceService.initialize();
      
      // Migrate from CSV if needed
      await persistenceService.migrateFromCSV();
      
      const businessDayService = new BusinessDayService();
      
      const today = getCurrentDate();
      
      const { skip, reason } = businessDayService.shouldSkipDate(today);
      if (skip) {
        console.log(`Skipping today (${today}): ${reason}`);
        return;
      }

      console.log(`Processing time entry for ${today}...`);

      await fillMissingEntries(clockifyService, persistenceService, businessDayService, config);
      
      await processCurrentDay(clockifyService, persistenceService, config, today);
      
      if (isLastBusinessDayOfMonth(today)) {
        await generateMonthlyReport(clockifyService, config, today);
      }

      console.log('Process completed successfully!');
      
    } catch (error) {
      console.error('Error during execution:', error);
      process.exit(1);
    } finally {
      if (persistenceService) {
        await persistenceService.close();
      }
    }
  });

  return run;
}

async function fillMissingEntries(
  clockifyService: ClockifyService,
  persistenceService: PersistenceService,
  businessDayService: BusinessDayService,
  config: any
): Promise<void> {
  console.log('Checking for missing time entries in Clockify...');
  
  // Check current month and previous month for missing entries
  const today = dayjs();
  const startOfPreviousMonth = today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const yesterday = today.subtract(1, 'day').format('YYYY-MM-DD');
  
  const dateRange = getDateRange(startOfPreviousMonth, yesterday);
  const weekdaysToCheck = dateRange.filter(date => isWeekday(date));
  
  console.log(`Checking ${weekdaysToCheck.length} weekdays from ${startOfPreviousMonth} to ${yesterday}...`);
  
  // Filter out dates that should be skipped
  const datesToCheck = weekdaysToCheck.filter(date => {
    const { skip } = businessDayService.shouldSkipDate(date);
    return !skip;
  });
  
  console.log(`Checking ${datesToCheck.length} valid dates with rate limiting...`);
  
  // Check dates in batches to avoid rate limits
  const CHECK_BATCH_SIZE = 10; // Check 10 dates at a time
  const checkBatches = [];
  
  for (let i = 0; i < datesToCheck.length; i += CHECK_BATCH_SIZE) {
    checkBatches.push(datesToCheck.slice(i, i + CHECK_BATCH_SIZE));
  }
  
  const entryResults = [];
  
  for (const [batchIndex, batch] of checkBatches.entries()) {
    console.log(`Checking batch ${batchIndex + 1}/${checkBatches.length} (${batch.length} dates)...`);
    
    const batchPromises = batch.map(async (date) => {
      const hasEntry = await clockifyService.hasEntryForDate(date);
      return { date, hasEntry };
    });
    
    const batchResults = await Promise.all(batchPromises);
    entryResults.push(...batchResults);
    
    // Small delay between batches to respect rate limits
    if (batchIndex < checkBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }
  
  // Find missing entries
  const missingDates = entryResults.filter(result => !result.hasEntry);
  
  console.log(`Found ${missingDates.length} missing entries out of ${datesToCheck.length} checked dates`);
  
  if (missingDates.length === 0) {
    console.log('✅ All dates have time entries in Clockify!');
    return;
  }
  
  // Get Jira task once if configured (for efficiency)
  let jiraTaskTitle = null;
  if (config.jiraBaseUrl && config.jiraEmail && config.jiraApiKey) {
    try {
      const jiraService = new JiraService(config);
      const tasks = await jiraService.getCurrentTasks();
      if (tasks.length > 0) {
        jiraTaskTitle = tasks[0].summary;
        console.log(`Using Jira task title: "${jiraTaskTitle}" for missing entries`);
      }
    } catch (error) {
      console.warn('Could not fetch Jira tasks, using fallback descriptions');
    }
  }
  
  // Create missing entries concurrently (but with some rate limiting)
  const BATCH_SIZE = 5; // Process 5 entries at a time to avoid API rate limits
  const batches = [];
  
  for (let i = 0; i < missingDates.length; i += BATCH_SIZE) {
    batches.push(missingDates.slice(i, i + BATCH_SIZE));
  }
  
  let addedCount = 0;
  
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\nProcessing batch ${batchIndex + 1}/${batches.length} (${batch.length} entries)...`);
    
    const addEntryPromises = batch.map(async ({ date }) => {
      try {
        // Get existing task description or use Jira/default
        const task = await persistenceService.getTaskForDate(date);
        let description = task ? task.description : (jiraTaskTitle || 'General work');
        
        const timeEntry = clockifyService.createTimeEntry(date, description);
        const result = await clockifyService.addTimeEntry(timeEntry);
        
        // Store in local database
        const startTime = dayjs(timeEntry.start).format('HH:mm:ss');
        const endTime = dayjs(timeEntry.end!).format('HH:mm:ss');
        const durationMinutes = dayjs(timeEntry.end!).diff(dayjs(timeEntry.start), 'minutes');
        
        await persistenceService.addTimeEntry({
          clockifyId: result.id,
          date,
          description,
          startTime,
          endTime,
          durationMinutes,
          projectId: clockifyService['projectId'],
          workspaceId: clockifyService['workspaceId']
        });
        
        console.log(`✅ Added entry for ${date}: ${description}`);
        return { date, success: true, description };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to add entry for ${date}:`, errorMessage);
        return { date, success: false, error: errorMessage };
      }
    });
    
    const batchResults = await Promise.all(addEntryPromises);
    const successCount = batchResults.filter(r => r.success).length;
    addedCount += successCount;
    
    console.log(`Batch ${batchIndex + 1} completed: ${successCount}/${batch.length} successful`);
    
    // Small delay between batches to be respectful to the API
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n📊 Missing entries summary:`);
  console.log(`   • Checked: ${datesToCheck.length} dates`);
  console.log(`   • Missing: ${missingDates.length} entries`);
  console.log(`   • Added: ${addedCount} new entries`);
}

async function processCurrentDay(
  clockifyService: ClockifyService,
  persistenceService: PersistenceService,
  config: any,
  today: string
): Promise<void> {
  
  // Always check Clockify directly for consistency
  const hasClockifyEntry = await clockifyService.hasEntryForDate(today);
  if (hasClockifyEntry) {
    console.log(`✓ Time entry already exists in Clockify for ${today}`);
    return;
  }

  let description = 'General work';
  
  try {
    if (config.jiraBaseUrl && config.jiraEmail && config.jiraApiKey) {
      const jiraService = new JiraService(config);
      const tasks = await jiraService.getCurrentTasks();
      
      if (tasks.length > 0) {
        // Use just the task title (summary) as the description
        description = tasks[0].summary;
        
        await persistenceService.addTask({
          startDate: today,
          project: config.projectId || 'default',
          description
        });
        
        console.log(`Updated task description from Jira: ${description} (${tasks[0].key})`);
      }
    } else {
      const existingTask = await persistenceService.getTaskForDate(today);
      if (existingTask) {
        description = existingTask.description;
      }
    }
  } catch (error) {
    console.warn('Could not fetch from Jira, using default or existing task:', error);
    
    const existingTask = await persistenceService.getTaskForDate(today);
    if (existingTask) {
      description = existingTask.description;
    }
  }

  const timeEntry = clockifyService.createTimeEntry(today, description);
  const result = await clockifyService.addTimeEntry(timeEntry);
  
  // Store in local database
  const startTime = dayjs(timeEntry.start).format('HH:mm:ss');
  const endTime = dayjs(timeEntry.end!).format('HH:mm:ss');
  const durationMinutes = dayjs(timeEntry.end!).diff(dayjs(timeEntry.start), 'minutes');
  
  await persistenceService.addTimeEntry({
    clockifyId: result.id,
    date: today,
    description,
    startTime,
    endTime,
    durationMinutes,
    projectId: (clockifyService as any).projectId,
    workspaceId: (clockifyService as any).workspaceId
  });
  
  console.log(`✅ Added time entry for ${today}: ${description}`);
  console.log(`   Entry ID: ${result.id}`);
}

async function generateMonthlyReport(
  clockifyService: ClockifyService,
  config: any,
  today: string
): Promise<void> {
  if (!config.reportDir) {
    console.log('Report directory not configured, skipping monthly report generation');
    return;
  }

  console.log('Last business day of month - generating PDF report...');
  
  try {
    const pdfService = new PDFService(config);
    const currentMonth = dayjs(today);
    
    const startDate = getFirstDayOfMonth(today);
    const endDate = getLastDayOfMonth(today);
    
    const entries = await clockifyService.getReportData(startDate, endDate);
    const totalHours = pdfService.calculateTotalHours(entries);
    
    const reportData = {
      month: currentMonth.format('MM'),
      year: currentMonth.year(),
      entries,
      totalHours
    };
    
    const reportPath = await pdfService.generateMonthlyReport(reportData);
    console.log(`Monthly report generated: ${reportPath}`);
    
  } catch (error) {
    console.error('Error generating monthly report:', error);
  }
}
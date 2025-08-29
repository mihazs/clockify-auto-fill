import { Command } from '@commander-js/extra-typings';
import { PersistenceService } from '../services/persistence';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

export function createTasksCommand(): Command {
  const tasks = new Command('tasks')
    .description('Manage task descriptions');

  tasks
    .command('list')
    .description('List all configured tasks')
    .action(async () => {
      let persistenceService: PersistenceService | null = null;
      
      try {
        persistenceService = new PersistenceService();
        await persistenceService.initialize();
        
        const allTasks = await persistenceService.getTasks();
        
        if (allTasks.length === 0) {
          console.log('📝 No tasks configured yet.');
          console.log('');
          console.log('Tasks define what work descriptions to use for different time periods.');
          console.log('');
          console.log('🚀 Get started:');
          console.log('  clockify-auto tasks add    # Add a new task');
          console.log('  clockify-auto setup        # Run full setup wizard');
          console.log('');
          return;
        }
        
        console.log('Configured Tasks:');
        console.log('================');
        
        allTasks.forEach((task, index) => {
          const status = dayjs().isBetween(dayjs(task.startDate), dayjs(task.endDate), 'day', '[]') ? '(ACTIVE)' : '';
          console.log(`${index + 1}. ${task.startDate} - ${task.endDate || 'ongoing'} ${status}`);
          console.log(`   Project: ${task.project}`);
          console.log(`   Description: ${task.description}`);
          console.log();
        });
      } catch (error) {
        console.error('Error listing tasks:', error);
      } finally {
        if (persistenceService) {
          await persistenceService.close();
        }
      }
    });

  tasks
    .command('add')
    .description('Add a new task')
    .argument('<start-date>', 'Start date (YYYY-MM-DD)')
    .argument('<project>', 'Project name')
    .argument('<description>', 'Task description')
    .action(async (startDate: string, project: string, description: string) => {
      let persistenceService: PersistenceService | null = null;
      
      try {
        if (!dayjs(startDate, 'YYYY-MM-DD', true).isValid()) {
          console.error('Invalid date format. Use YYYY-MM-DD');
          return;
        }
        
        persistenceService = new PersistenceService();
        await persistenceService.initialize();
        
        await persistenceService.addTask({
          startDate,
          project,
          description
        });
        
        console.log(`Task added: ${startDate} - ${project}: ${description}`);
      } catch (error) {
        console.error('Error adding task:', error);
      } finally {
        if (persistenceService) {
          await persistenceService.close();
        }
      }
    });

  tasks
    .command('current')
    .description('Show current active task')
    .action(async () => {
      let persistenceService: PersistenceService | null = null;
      
      try {
        persistenceService = new PersistenceService();
        await persistenceService.initialize();
        
        const currentTask = await persistenceService.getCurrentTask();
        
        if (currentTask) {
          console.log('Current Task:');
          console.log(`  Date Range: ${currentTask.startDate} - ${currentTask.endDate || 'ongoing'}`);
          console.log(`  Project: ${currentTask.project}`);
          console.log(`  Description: ${currentTask.description}`);
        } else {
          console.log('No task configured for today.');
        }
      } catch (error) {
        console.error('Error getting current task:', error);
      } finally {
        if (persistenceService) {
          await persistenceService.close();
        }
      }
    });

  tasks
    .command('remove')
    .description('Remove a task by start date')
    .argument('<start-date>', 'Start date of task to remove (YYYY-MM-DD)')
    .action(async (startDate: string) => {
      let persistenceService: PersistenceService | null = null;
      
      try {
        if (!dayjs(startDate, 'YYYY-MM-DD', true).isValid()) {
          console.error('Invalid date format. Use YYYY-MM-DD');
          return;
        }
        
        persistenceService = new PersistenceService();
        await persistenceService.initialize();
        
        await persistenceService.deleteTask(startDate);
        console.log(`Task removed for date: ${startDate}`);
      } catch (error) {
        console.error('Error removing task:', error);
      } finally {
        if (persistenceService) {
          await persistenceService.close();
        }
      }
    });

  tasks
    .command('entries')
    .description('Show time entries for a date')
    .argument('[date]', 'Date to show entries for (YYYY-MM-DD), defaults to today')
    .action(async (date?: string) => {
      let persistenceService: PersistenceService | null = null;
      
      try {
        const targetDate = date || dayjs().format('YYYY-MM-DD');
        
        if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
          console.error('Invalid date format. Use YYYY-MM-DD');
          return;
        }
        
        persistenceService = new PersistenceService();
        await persistenceService.initialize();
        
        const entries = await persistenceService.getTimeEntriesForDate(targetDate);
        
        if (entries.length === 0) {
          console.log(`No time entries found for ${targetDate}`);
          return;
        }
        
        console.log(`Time Entries for ${targetDate}:`);
        console.log('================================');
        
        entries.forEach((entry, index) => {
          console.log(`${index + 1}. ${entry.startTime} - ${entry.endTime} (${entry.durationMinutes} min)`);
          console.log(`   Description: ${entry.description}`);
          console.log(`   Clockify ID: ${entry.clockifyId || 'Not synced'}`);
          console.log();
        });
        
        const totalMinutes = entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        console.log(`Total: ${hours}h ${minutes}m`);
      } catch (error) {
        console.error('Error getting time entries:', error);
      } finally {
        if (persistenceService) {
          await persistenceService.close();
        }
      }
    });

  return tasks;
}
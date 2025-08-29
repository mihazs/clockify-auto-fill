import dayjs from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(weekday);
dayjs.extend(isoWeek);

export function isWeekday(date: string): boolean {
  const day = dayjs(date).day();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

export function isWeekend(date: string): boolean {
  return !isWeekday(date);
}

export function formatDateForClockify(date: string): string {
  return dayjs(date).format('YYYY-MM-DD');
}

export function formatDateTimeForClockify(date: string, hour: number = 9, minute: number = 0): string {
  return dayjs(date).hour(hour).minute(minute).second(0).toISOString();
}

export function getCurrentDate(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (current.isBefore(end) || current.isSame(end)) {
    dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }

  return dates;
}

export function getWeekdaysInRange(startDate: string, endDate: string): string[] {
  return getDateRange(startDate, endDate).filter(isWeekday);
}

export function getLastWeekday(date?: string): string {
  let current = dayjs(date || undefined);
  
  while (!isWeekday(current.format('YYYY-MM-DD'))) {
    current = current.subtract(1, 'day');
  }
  
  return current.format('YYYY-MM-DD');
}

export function getPreviousWeekdays(count: number, fromDate?: string): string[] {
  const dates: string[] = [];
  let current = dayjs(fromDate || undefined);
  
  while (dates.length < count) {
    current = current.subtract(1, 'day');
    if (isWeekday(current.format('YYYY-MM-DD'))) {
      dates.push(current.format('YYYY-MM-DD'));
    }
  }
  
  return dates.reverse();
}

export function isLastBusinessDayOfMonth(date: string): boolean {
  const currentDate = dayjs(date);
  const lastDayOfMonth = currentDate.endOf('month');
  
  let lastBusinessDay = lastDayOfMonth;
  while (!isWeekday(lastBusinessDay.format('YYYY-MM-DD'))) {
    lastBusinessDay = lastBusinessDay.subtract(1, 'day');
  }
  
  return currentDate.isSame(lastBusinessDay, 'day');
}

export function getFirstDayOfMonth(date: string): string {
  return dayjs(date).startOf('month').format('YYYY-MM-DD');
}

export function getLastDayOfMonth(date: string): string {
  return dayjs(date).endOf('month').format('YYYY-MM-DD');
}
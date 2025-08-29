import { isWeekday } from './dateUtils';
import { HolidayService } from '../services/holiday';

export class BusinessDayService {
  private holidayService: HolidayService;

  constructor() {
    this.holidayService = new HolidayService();
  }

  isBusinessDay(date: string): boolean {
    if (!isWeekday(date)) {
      return false;
    }
    
    if (this.holidayService.isHoliday(date)) {
      return false;
    }
    
    return true;
  }

  getSkipReason(date: string): string | null {
    if (!isWeekday(date)) {
      return 'Weekend';
    }
    
    const holidayName = this.holidayService.getHolidayName(date);
    if (holidayName) {
      return `Holiday: ${holidayName}`;
    }
    
    return null;
  }

  shouldSkipDate(date: string): { skip: boolean; reason?: string } {
    const reason = this.getSkipReason(date);
    return {
      skip: reason !== null,
      reason: reason || undefined
    };
  }
}
import Holidays from 'date-holidays';

export class HolidayService {
  private holidays: Holidays;

  constructor() {
    this.holidays = new Holidays('BR');
  }

  isHoliday(date: string): boolean {
    try {
      const holidayData = this.holidays.isHoliday(new Date(date));
      return holidayData !== false && holidayData.length > 0;
    } catch (error) {
      console.error('Error checking holiday:', error);
      return false;
    }
  }

  getHolidayName(date: string): string | null {
    try {
      const holidayData = this.holidays.isHoliday(new Date(date));
      if (holidayData && holidayData.length > 0) {
        return holidayData[0].name;
      }
      return null;
    } catch (error) {
      console.error('Error getting holiday name:', error);
      return null;
    }
  }

  getAllHolidays(year: number): Array<{ date: string; name: string }> {
    try {
      const holidaysForYear = this.holidays.getHolidays(year);
      return holidaysForYear.map(holiday => ({
        date: holiday.date,
        name: holiday.name
      }));
    } catch (error) {
      console.error('Error getting all holidays:', error);
      return [];
    }
  }
}
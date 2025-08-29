import chalk from 'chalk';
import boxen from 'boxen';
import ora, { Ora } from 'ora';

export class WizardUI {
  private static readonly BRAND_COLOR = '#00BCD4'; // Clockify teal
  private static readonly SUCCESS_COLOR = '#4CAF50';
  private static readonly ERROR_COLOR = '#F44336';
  private static readonly WARNING_COLOR = '#FF9800';
  private static readonly INFO_COLOR = '#2196F3';

  // Icons
  private static readonly ICONS = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    arrow: '→',
    bullet: '•',
    check: '☑',
    uncheck: '☐',
    spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  };

  static showWelcome(): void {
    const logo = `
  ╔═══════════════════════════════════════╗
  ║           CLOCKIFY AUTO CLI           ║
  ║         Setup Wizard v1.0             ║
  ╚═══════════════════════════════════════╝
    `;

    console.log(chalk.hex(this.BRAND_COLOR).bold(logo));
    
    const welcomeText = `
Welcome to Clockify Auto CLI Setup Wizard! 🚀

This wizard will help you configure:
${chalk.hex(this.INFO_COLOR)('• Clockify API integration (required)')}
${chalk.hex(this.WARNING_COLOR)('• Jira integration (optional)')}
${chalk.hex(this.INFO_COLOR)('• PDF reports directory')}
${chalk.hex(this.INFO_COLOR)('• Validation of all connections')}

Let's get started!
    `.trim();

    console.log(boxen(welcomeText, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: this.BRAND_COLOR
    }));
  }

  static showSectionHeader(title: string, description?: string): void {
    console.log('\n' + chalk.hex(this.BRAND_COLOR).bold(`▶ ${title}`));
    if (description) {
      console.log(chalk.gray(`  ${description}`));
    }
    console.log();
  }

  static showStep(stepNumber: number, totalSteps: number, stepName: string): void {
    const progress = `[${stepNumber}/${totalSteps}]`;
    console.log(chalk.hex(this.BRAND_COLOR).bold(`${progress} ${stepName}`));
  }

  static success(message: string, details?: string): void {
    console.log(chalk.hex(this.SUCCESS_COLOR)(`${this.ICONS.success} ${message}`));
    if (details) {
      console.log(chalk.gray(`  ${details}`));
    }
  }

  static error(message: string, details?: string): void {
    console.log(chalk.hex(this.ERROR_COLOR)(`${this.ICONS.error} ${message}`));
    if (details) {
      console.log(chalk.red(`  ${details}`));
    }
  }

  static warning(message: string, details?: string): void {
    console.log(chalk.hex(this.WARNING_COLOR)(`${this.ICONS.warning} ${message}`));
    if (details) {
      console.log(chalk.yellow(`  ${details}`));
    }
  }

  static info(message: string, details?: string): void {
    console.log(chalk.hex(this.INFO_COLOR)(`${this.ICONS.info} ${message}`));
    if (details) {
      console.log(chalk.gray(`  ${details}`));
    }
  }

  static createSpinner(text: string): Ora {
    return ora({
      text,
      spinner: {
        interval: 80,
        frames: this.ICONS.spinner
      },
      color: 'cyan'
    });
  }

  static showProgress(current: number, total: number, label?: string): void {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round(percentage / 5); // 20 chars total
    const empty = 20 - filled;
    
    const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
    const progressText = label ? `${label} (${percentage}%)` : `${percentage}%`;
    
    console.log(`${chalk.hex(this.BRAND_COLOR)(progressBar)} ${progressText}`);
  }

  static showConfigSummary(config: Record<string, any>): void {
    console.log('\n' + chalk.hex(this.BRAND_COLOR).bold('📋 Configuration Summary'));
    console.log('═'.repeat(50));
    
    Object.entries(config).forEach(([key, value]) => {
      const displayKey = this.formatConfigKey(key);
      const displayValue = this.formatConfigValue(key, value);
      
      if (value) {
        console.log(`${chalk.green(this.ICONS.check)} ${displayKey}: ${displayValue}`);
      } else {
        console.log(`${chalk.gray(this.ICONS.uncheck)} ${displayKey}: ${chalk.gray('Not configured')}`);
      }
    });
    
    console.log('═'.repeat(50));
  }

  static showNextSteps(hasScheduling: boolean = false): void {
    const steps = [
      'Run your first time entry: clockify-auto run',
      'View your tasks: clockify-auto tasks list',
      'Check configuration anytime: clockify-auto info'
    ];

    if (hasScheduling) {
      steps.push('Enable automatic scheduling: clockify-auto schedule enable');
    }

    const nextStepsText = `
🎉 Setup Complete! Here's what you can do next:

${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

${chalk.hex(this.INFO_COLOR)('💡 Tip: Run "clockify-auto --help" to see all available commands')}
    `.trim();

    console.log(boxen(nextStepsText, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: this.SUCCESS_COLOR
    }));
  }

  static showErrorBox(title: string, message: string, suggestions?: string[]): void {
    let content = `${chalk.hex(this.ERROR_COLOR).bold(title)}\n\n${message}`;
    
    if (suggestions && suggestions.length > 0) {
      content += '\n\n' + chalk.hex(this.INFO_COLOR).bold('Suggestions:');
      suggestions.forEach(suggestion => {
        content += `\n${this.ICONS.bullet} ${suggestion}`;
      });
    }

    console.log(boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: this.ERROR_COLOR
    }));
  }

  static showInfoBox(title: string, message: string, items?: string[]): void {
    let content = `${chalk.hex(this.INFO_COLOR).bold(title)}\n\n${message}`;
    
    if (items && items.length > 0) {
      items.forEach(item => {
        content += `\n${this.ICONS.bullet} ${item}`;
      });
    }

    console.log(boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: this.INFO_COLOR
    }));
  }

  static showTable(headers: string[], rows: string[][]): void {
    const colWidths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
      return Math.max(header.length, maxRowWidth) + 2;
    });

    // Header
    const headerRow = headers.map((header, i) => 
      chalk.hex(this.BRAND_COLOR).bold(header.padEnd(colWidths[i]))
    ).join('');
    
    console.log(headerRow);
    console.log('─'.repeat(colWidths.reduce((sum, width) => sum + width, 0)));

    // Rows
    rows.forEach(row => {
      const formattedRow = row.map((cell, i) => 
        (cell || '').padEnd(colWidths[i])
      ).join('');
      console.log(formattedRow);
    });
  }

  static clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  static moveCursor(lines: number): void {
    process.stdout.write(`\x1b[${Math.abs(lines)}${lines > 0 ? 'B' : 'A'}`);
  }

  static formatList(items: string[], prefix: string = this.ICONS.bullet): string {
    return items.map(item => `${prefix} ${item}`).join('\n');
  }

  static formatChoice(text: string, isSelected: boolean): string {
    const icon = isSelected ? this.ICONS.check : this.ICONS.uncheck;
    const color = isSelected ? chalk.hex(this.SUCCESS_COLOR) : chalk.gray;
    return color(`${icon} ${text}`);
  }

  private static formatConfigKey(key: string): string {
    const keyMap: Record<string, string> = {
      clockifyApiKey: 'Clockify API Key',
      workspaceId: 'Workspace',
      projectId: 'Project',
      jiraBaseUrl: 'Jira Base URL',
      jiraEmail: 'Jira Email',
      jiraApiKey: 'Jira API Token',
      reportDir: 'Reports Directory'
    };
    
    return keyMap[key] || key;
  }

  private static formatConfigValue(key: string, value: any): string {
    if (!value) {
      return chalk.gray('Not configured');
    }

    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
      return chalk.yellow('●'.repeat(8) + ' (hidden)');
    }

    if (typeof value === 'object') {
      if (value.name) {
        return chalk.white(value.name);
      }
      return chalk.white(JSON.stringify(value));
    }

    return chalk.white(value.toString());
  }

  // Validation message formatters
  static formatValidationSuccess(service: string, details: string): void {
    this.success(`${service} connection successful`, details);
  }

  static formatValidationError(service: string, error: string): void {
    this.error(`${service} validation failed`, error);
  }

  // Async spinner wrapper
  static async withSpinner<T>(
    text: string,
    operation: () => Promise<T>,
    successText?: string,
    errorText?: string
  ): Promise<T> {
    const spinner = this.createSpinner(text);
    spinner.start();

    try {
      const result = await operation();
      spinner.succeed(successText || text);
      return result;
    } catch (error) {
      spinner.fail(errorText || `${text} failed`);
      throw error;
    }
  }
}
# Clockify Auto-Fill

<div align="center">

[![npm version](https://badge.fury.io/js/clockify-auto-fill.svg)](https://badge.fury.io/js/clockify-auto-fill)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/your-username/clockify-auto-fill/workflows/CI/badge.svg)](https://github.com/your-username/clockify-auto-fill/actions)

**Automated time tracking for Clockify with Jira integration**

*Never forget to log your time again. Automatically create time entries, sync with Jira tasks, and generate monthly reports.*

[Features](#-features) • [Installation](#-quick-start) • [Quick Start](#-quick-start) • [Documentation](#-commands-reference) • [Contributing](#-contributing)

</div>

## ✨ Features

- 🚀 **Automated Time Tracking**: Automatically creates daily time entries in Clockify
- 🔄 **Missing Entries Detection**: Scans and fills gaps in your time tracking history with concurrent processing
- 🎯 **Jira Integration**: Uses your assigned Jira task titles as time entry descriptions  
- ⏰ **Configurable Work Hours**: Set custom start/end times for your workday
- 📊 **Monthly Reports**: Generates beautiful PDF reports at month-end
- ⚡ **High Performance**: Concurrent API calls with intelligent rate limiting (8x faster)
- 🛡️ **2025 API Ready**: Updated for latest Clockify and Jira API versions
- 💾 **SQLite Storage**: Reliable local database with automatic migrations
- 🎨 **Interactive Setup**: Beautiful CLI wizard for easy configuration
- ⚙️ **Flexible Scheduling**: Works with cron jobs, GitHub Actions, or manual execution

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g clockify-auto-fill

# Or using yarn
yarn global add clockify-auto-fill

# Or using pnpm
pnpm add -g clockify-auto-fill
```

### Initial Setup

Run the interactive setup wizard:

```bash
clockify-auto setup
```

This will guide you through:
- Clockify API configuration and workspace selection
- Jira integration setup (optional)
- Report generation preferences

### Daily Usage

```bash
# Create today's time entry (if missing) and check for gaps
clockify-auto run

# View current configuration
clockify-auto info

# Open configuration manager
clockify-auto config
```

## 📋 Prerequisites

- **Node.js** 16+ 
- **Clockify Account** with API access
- **Jira Cloud Account** (optional, for task integration)

## 🔧 Installation & Setup

### 1. Install the CLI

```bash
npm install -g clockify-auto-fill
```

### 2. Get Your API Keys

#### Clockify API Key
1. Go to [Clockify Settings > API](https://clockify.me/user/settings)
2. Copy your API key

#### Jira API Token (Optional)
1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create a new API token
3. For 2025 compatibility, consider using scoped tokens (ATATT format)

### 3. Run Setup Wizard

```bash
clockify-auto setup
```

The wizard will:
- ✅ Validate your Clockify API key
- 🏢 Fetch and let you select your workspace
- 📋 Fetch and let you select your project  
- 🎯 Configure Jira integration (optional)
- 📁 Set up report generation directory
- ✨ Test the complete integration

## 📖 Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `clockify-auto run` | Execute daily time entry process |
| `clockify-auto setup` | Interactive setup wizard |
| `clockify-auto info` | Show configuration and status |

### Configuration Management

| Command | Description |
|---------|-------------|
| `clockify-auto config` | Open configuration menu |
| `clockify-auto config wizard` | Re-run setup wizard |
| `clockify-auto config validate` | Validate current configuration |
| `clockify-auto config reset` | Reset configuration |
| `clockify-auto config export` | Export configuration to file |
| `clockify-auto config import <file>` | Import configuration from file |
| `clockify-auto config set defaultStartTime "09:00"` | Set work start time |
| `clockify-auto config set defaultEndTime "17:00"` | Set work end time |

### Advanced Commands

| Command | Description |
|---------|-------------|
| `clockify-auto schedule` | Set up automated scheduling |
| `clockify-auto tasks` | Manage task descriptions |

## ⚙️ Configuration

### Configuration File

Configuration is stored in `~/.clockify-auto/config.json`:

```json
{
  "clockifyApiKey": "your-api-key",
  "workspaceId": "workspace-id", 
  "projectId": "project-id",
  "jiraBaseUrl": "https://company.atlassian.net",
  "jiraEmail": "your-email@company.com",
  "jiraApiKey": "your-jira-token",
  "reportDir": "/path/to/reports",
  "defaultStartTime": "09:00",
  "defaultEndTime": "17:00"
}
```

### Environment Variables

You can also use environment variables:

```bash
export CLOCKIFY_API_KEY="your-api-key"
export CLOCKIFY_WORKSPACE_ID="workspace-id"
export CLOCKIFY_PROJECT_ID="project-id"
export JIRA_BASE_URL="https://company.atlassian.net"
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_KEY="your-jira-token"
export REPORT_DIR="/path/to/reports"
export DEFAULT_START_TIME="09:00"
export DEFAULT_END_TIME="17:00"
```

### Work Hours Configuration

Configure your default work hours for automatic time entry creation:

```bash
# Set work hours using config commands
clockify-auto config set defaultStartTime "08:30"
clockify-auto config set defaultEndTime "17:30"

# View current work hours
clockify-auto config get defaultStartTime
clockify-auto config get defaultEndTime
```

**Supported Time Formats:**
- Use 24-hour format: `HH:mm` (e.g., "09:00", "17:30")
- Minimum duration: 1 hour
- Maximum duration: 24 hours
- Start time must be before end time

**Examples:**
- **Standard 9-5**: `"09:00"` to `"17:00"` (8 hours)
- **Early bird**: `"07:00"` to `"15:00"` (8 hours)  
- **Flexible**: `"10:30"` to `"18:30"` (8 hours)
- **Part-time**: `"09:00"` to `"13:00"` (4 hours)

If not configured, the default work hours are **9:00 AM to 5:00 PM**.

## 🔄 Automation & Scheduling

### Cron Job (Linux/macOS)

Add to your crontab (`crontab -e`):

```bash
# Run every weekday at 9 AM
0 9 * * 1-5 /usr/local/bin/clockify-auto run

# Run every weekday at 6 PM (catch any missed entries)
0 18 * * 1-5 /usr/local/bin/clockify-auto run
```

### GitHub Actions

Create `.github/workflows/clockify-auto.yml`:

```yaml
name: Clockify Auto-Fill

on:
  schedule:
    # Run at 9 AM UTC, Monday to Friday
    - cron: '0 9 * * 1-5'
  workflow_dispatch: # Allow manual trigger

jobs:
  fill-time:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install Clockify Auto-Fill
        run: npm install -g clockify-auto-fill
        
      - name: Run Time Entry Process
        run: clockify-auto run
        env:
          CLOCKIFY_API_KEY: ${{ secrets.CLOCKIFY_API_KEY }}
          CLOCKIFY_WORKSPACE_ID: ${{ secrets.CLOCKIFY_WORKSPACE_ID }}
          CLOCKIFY_PROJECT_ID: ${{ secrets.CLOCKIFY_PROJECT_ID }}
          JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_KEY: ${{ secrets.JIRA_API_KEY }}
```

### Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., daily at 9 AM)
4. Set action: `clockify-auto run`

## 📊 Reports

### Monthly PDF Reports

Automatically generated on the last business day of each month:

- 📈 **Time Summary**: Total hours, daily breakdowns
- 📋 **Task Details**: All time entries with descriptions  
- 🎨 **Professional Format**: Clean, printable PDF layout
- 📁 **Auto-Organization**: Saved to configured reports directory

Example report structure:
```
~/Documents/Clockify-Reports/
├── clockify-report-2025-01.pdf
├── clockify-report-2025-02.pdf
└── clockify-report-2025-03.pdf
```

## 🔗 Integrations

### Jira Integration

When configured, the tool will:

1. 🎯 **Fetch Assigned Tasks**: Gets your currently assigned Jira issues
2. 📝 **Use Task Titles**: Uses the issue summary as the time entry description
3. 🔄 **Smart Fallback**: Falls back to stored descriptions or "General work"

**Supported Jira Setups:**
- Jira Cloud (2025 API v3 compatible)
- Standard API tokens
- Scoped API tokens (ATATT format)
- Custom Jira installations

### API Compatibility

**Clockify API:**
- ✅ REST API v1 (latest)
- ✅ Reports API v1
- ✅ Proper user ID resolution
- ✅ Rate limiting compliance

**Jira API:**
- ✅ REST API v3 (latest)
- ✅ Cloud ID resolution for scoped tokens
- ✅ GDPR-compliant user identification
- ✅ 2025 authentication standards

## 🚀 How It Works

### Daily Process

1. **🔍 Authentication**: Validates API credentials
2. **📅 Date Analysis**: Determines business days to check
3. **⚡ Batch Checking**: Concurrently checks multiple dates for missing entries
4. **🎯 Jira Sync**: Fetches current assigned task for descriptions
5. **➕ Entry Creation**: Creates missing time entries in batches
6. **💾 Local Storage**: Stores entries in SQLite database for reference
7. **📊 Reporting**: Generates monthly PDF reports when needed

### Performance Features

- **🚀 Concurrent API Calls**: Up to 8x faster than sequential processing
- **🛡️ Rate Limit Handling**: Intelligent batching to avoid API limits  
- **📱 Progress Feedback**: Real-time progress indicators
- **🔄 Retry Logic**: Automatic retry on transient failures
- **💾 Caching**: Efficient data storage to minimize API calls

## 🔧 Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/mihazs/clockify-auto-fill.git
cd clockify-auto-fill

# Install dependencies
npm install

# Build the project
npm run build

# Link for local testing
npm link

# Run tests
npm test

# Run linting
npm run lint
```

### Project Structure

```
├── src/
│   ├── commands/          # CLI command implementations
│   ├── services/          # Core business logic
│   ├── utils/            # Utility functions
│   └── index.ts          # CLI entry point
├── tests/                # Test files
├── dist/                 # Compiled JavaScript
├── docs/                 # Documentation
└── .github/              # GitHub Actions workflows
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Build in watch mode |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run semantic-release` | Create automated release |
| `npm run semantic-release:dry-run` | Preview release changes |

## 🚀 Release Process

This project uses **automated semantic releases** powered by [semantic-release](https://semantic-release.gitbook.io/):

### How It Works

1. **Development**: Make changes using [conventional commits](https://conventionalcommits.org/)
2. **Pull Request**: Create PR with your changes
3. **Automated Release**: On merge to `main`, semantic-release will:
   - Analyze commits to determine version bump
   - Generate changelog from conventional commits
   - Create GitHub release with release notes  
   - Publish to npm automatically
   - Update version in package.json

### Commit Types and Releases

| Commit Type | Example | Version Bump |
|-------------|---------|--------------|
| `feat:` | `feat: add custom work hours` | Minor (1.1.0) |
| `fix:` | `fix: resolve API rate limiting` | Patch (1.0.1) |
| `feat!:` | `feat!: remove Node 14 support` | Major (2.0.0) |
| `docs:`, `refactor:` | `docs: update README` | Patch (1.0.1) |
| `chore:`, `style:`, `test:` | `chore: update deps` | No release |

### Manual Testing

```bash
# Preview what would be released (no changes made)
npm run semantic-release:dry-run

# View commit history for release planning
git log --oneline --decorate --graph
```

## 🐛 Troubleshooting

### Common Issues

#### "Invalid API Key" Error
```bash
# Verify your API key
clockify-auto config validate

# Or reset and reconfigure
clockify-auto config reset
clockify-auto setup
```

#### "403 Permission Denied" Error
- Check if your API key has sufficient permissions
- For Jira: Ensure you have access to assigned issues
- For Clockify Reports: The tool automatically handles permission restrictions

#### "429 Too Many Requests" Error
The tool has built-in rate limiting, but if you encounter this:
- Wait a few minutes for the rate limit to reset
- The tool will automatically retry with delays

#### Missing Time Entries Not Detected
```bash
# Force a comprehensive check
clockify-auto run

# Validate configuration
clockify-auto config validate
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=clockify-auto:* clockify-auto run
```

### Getting Help

1. 📖 Check this documentation
2. 🐛 [Open an issue](https://github.com/your-username/clockify-auto-fill/issues)
3. 💬 [Start a discussion](https://github.com/your-username/clockify-auto-fill/discussions)

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. 🍴 Fork the repository
2. 🌟 Create a feature branch: `git checkout -b feature/amazing-feature`
3. 💻 Make your changes
4. ✅ Add tests for new functionality
5. 🧪 Run the test suite: `npm test`
6. 📝 Commit your changes: `git commit -m 'Add amazing feature'`
7. 🚀 Push to the branch: `git push origin feature/amazing-feature`
8. 🔄 Open a Pull Request

### Development Guidelines

- Use TypeScript for type safety
- Add tests for new features
- Follow existing code style
- Update documentation
- Ensure CI passes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Clockify](https://clockify.me) for the excellent time tracking platform
- [Atlassian](https://atlassian.com) for Jira integration capabilities
- The open source community for inspiration and tools

## 📈 Roadmap

- [ ] **Multiple Project Support**: Handle multiple Clockify projects
- [ ] **Custom Time Templates**: Configurable start/end times per day
- [ ] **Team Integration**: Bulk operations for team management
- [ ] **Advanced Reporting**: Custom report templates and formats
- [ ] **Web Dashboard**: Optional web interface for management
- [ ] **Slack Integration**: Notifications and commands via Slack
- [ ] **Timezone Support**: Better handling of different timezones

---

<div align="center">

**[⭐ Star this project](https://github.com/your-username/clockify-auto-fill)** if you find it useful!

Made with ❤️ for developers who forget to track time

</div>
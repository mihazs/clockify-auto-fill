# Contributing to Clockify Auto-Fill

We love your input! We want to make contributing to Clockify Auto-Fill as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Development Setup

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Local Development

```bash
# Clone your fork
git clone https://github.com/your-username/clockify-auto-fill.git
cd clockify-auto-fill

# Install dependencies
npm install

# Build the project
npm run build

# Link for local testing
npm link

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Testing Your Changes

```bash
# Test the CLI after building
npm run build
clockify-auto --version
clockify-auto --help

# Test specific commands
clockify-auto setup
clockify-auto run
```

## Code Style

We use ESLint for code linting. Please ensure your code follows our style guidelines:

- Use TypeScript for type safety
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

## Writing Tests

- Add tests for new features and bug fixes
- Tests are located in the `tests/` directory
- Use Jest as the testing framework
- Aim for good test coverage

Example test structure:
```typescript
describe('FeatureName', () => {
  it('should do something specific', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## Commit Messages

We use [Conventional Commits](https://conventionalcommits.org/) for automated releases and changelog generation.

### Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Release |
|------|-------------|---------|
| `feat:` | New features | Minor version |
| `fix:` | Bug fixes | Patch version |
| `perf:` | Performance improvements | Patch version |
| `docs:` | Documentation changes | Patch version (if README) |
| `refactor:` | Code refactoring | Patch version |
| `style:` | Code style changes | No release |
| `test:` | Adding/updating tests | No release |
| `build:` | Build system changes | No release |
| `ci:` | CI/CD changes | No release |
| `chore:` | Maintenance tasks | No release |
| `revert:` | Reverting changes | Patch version |

### Breaking Changes

Add `!` after the type/scope or include `BREAKING CHANGE:` in the footer:

```
feat!: remove support for Node.js 14
feat: add new API endpoint

BREAKING CHANGE: Node.js 14 is no longer supported
```

### Examples

```bash
# Feature additions (minor version bump)
feat: add support for custom work hours configuration
feat(api): add batch time entry creation endpoint
feat(config): implement environment variable support

# Bug fixes (patch version bump)
fix: resolve API rate limiting issues with batch processing
fix(clockify): handle missing project permissions gracefully
fix(setup): validate time format in work hours configuration

# Documentation (patch version bump for README)
docs: update installation instructions in README
docs(api): add JSDoc comments for public methods

# No release
chore: update dependencies
test: add unit tests for time validation
style: fix linting issues
ci: update GitHub Actions workflow

# Breaking changes (major version bump)
feat!: remove deprecated configuration options
fix!: change default work hours format to 24-hour
```

### Setup Git Commit Template

Configure your git to use our commit message template:

```bash
git config commit.template .gitmessage
```

This will show helpful commit guidelines when you run `git commit`.

## Bug Reports

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/your-username/clockify-auto-fill/issues).

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Feature Requests

We welcome feature requests! Please:

1. Check if the feature already exists or is planned
2. Open a GitHub issue with the `enhancement` label
3. Describe the feature and why it would be useful
4. Provide examples of how it would work

## Security Issues

Please do not report security issues in public GitHub issues. Instead, email us directly at [security@your-domain.com] or use GitHub's security advisory feature.

## API Compatibility

When making changes:

- **Breaking Changes**: Increment major version, document in CHANGELOG.md
- **New Features**: Increment minor version
- **Bug Fixes**: Increment patch version

## Documentation

- Update README.md for new features or installation changes
- Add JSDoc comments for new public APIs
- Update CLI help text when adding commands
- Include examples in documentation

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a pull request
4. After merge, create a GitHub release
5. The publish workflow will automatically publish to npm

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue with the `question` label or start a discussion in our GitHub Discussions.

---

**Thank you for contributing to Clockify Auto-Fill!** 🎉
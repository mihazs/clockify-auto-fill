module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|boxen|ora|ansi-.*|strip-.*|wrap-.*|string-.*|cli-.*|is-.*|escape-.*|camelcase|@sindresorhus)/)'
  ],
};
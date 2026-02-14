export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/src/test-utils/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^#db$': '<rootDir>/src/platform/db/index.ts',
    '^#logger$': '<rootDir>/src/platform/logger/index.ts',
    '^#modules/(.*)$': '<rootDir>/src/modules/$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  // Unit tests must be fast and DB-free.
  //
  // DB-backed tests live in:
  // - `src/integration-tests/**/*.int.test.ts` (preferred)
  //
  // Legacy integration tests (prototype-era) live in various module folders and are ignored here.
  testPathIgnorePatterns: [
    '/src/modules/_archived/',
    '/src/modules/prototype1/_archived/',
    '/src/integration-tests/_archived/',
    '/src/integration-tests/',
    '\\.api\\.test\\.ts$',
    '\\.int\\.test\\.ts$',
    '\\.integration\\.test\\.ts$',
    '/src/modules/auth/tests/auth\\.test\\.ts$',
    '/src/platform/events/tests/outbox\\.test\\.ts$'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/server.ts'
  ]
};

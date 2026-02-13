export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  setupFiles: ["<rootDir>/src/test-utils/jest.setup.ts"],
  globalSetup: "<rootDir>/src/test-utils/jest.global-setup.cjs",
  globalTeardown: "<rootDir>/src/test-utils/jest.global-teardown.cjs",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^#db$": "<rootDir>/src/platform/db/index.ts",
    "^#logger$": "<rootDir>/src/platform/logger/index.ts",
    "^#modules/(.*)$": "<rootDir>/src/modules/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  // Integration tests are DB-backed and may exercise HTTP middleware using supertest,
  // but should not bind to a network port.
  testMatch: ["**/*.int.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/server.ts",
  ],
};


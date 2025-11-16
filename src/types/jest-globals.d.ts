declare module '@jest/globals' {
  export const describe: jest.Describe;
  export const it: jest.It;
  export const expect: jest.Expect;
  export const test: jest.It;
  export const beforeAll: jest.Lifecycle;
  export const beforeEach: jest.Lifecycle;
  export const afterAll: jest.Lifecycle;
  export const afterEach: jest.Lifecycle;
  export const jest: typeof import('jest-mock');
}

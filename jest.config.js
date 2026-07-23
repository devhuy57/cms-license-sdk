/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.build.json', isolatedModules: true },
    ],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
};

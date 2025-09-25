module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(marked)/)'
  ],
  moduleNameMapper: {
    '^./htmlTemplate$': '<rootDir>/tests/__mocks__/htmlTemplate.js'
  }
};
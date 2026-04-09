module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    // Sequelize models call process.exit on bad config — set required env before any require
    globalSetup: '<rootDir>/src/__tests__/globalSetup.js',
    verbose: true,
    collectCoverageFrom: [
        'src/middleware/**/*.js',
        'src/controller/**/*.js',
        '!src/migrations/**',
        '!src/models/**',
    ],
    coverageDirectory: 'coverage',
    testTimeout: 15000,
};

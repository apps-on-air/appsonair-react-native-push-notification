module.exports = {
  preset: 'react-native',

  // The example is not an npm dependant of the library -- Metro resolves it
  // through react-native.config.js and the workspace root, which Jest does not
  // read. Without this the suite cannot even import App.tsx.
  moduleNameMapper: {
    '^appsonair-react-native-push$': '<rootDir>/../src/index.tsx',
  },

  // Not `setupFiles`: that key belongs to the react-native preset, and setting
  // it here would replace the preset's list rather than add to it.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

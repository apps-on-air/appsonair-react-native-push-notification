const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');

/** Resolves a package the way Node would (works with hoisted workspaces). */
const resolveFrom = (name) =>
  path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));

/**
 * Runs the example against the library source:
 * - `watchFolders`: reload on edits to ../src.
 * - `source` main field: use src/index.tsx, not the built lib/.
 * - `extraNodeModules`: a single copy of react / react-native.
 */
const config = {
  watchFolders: [root],
  resolver: {
    resolverMainFields: ['source', 'react-native', 'browser', 'main'],
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(root, 'node_modules'),
    ],
    extraNodeModules: {
      // Alias the library to the repo root (resolves to ../src/index.tsx).
      'appsonair-react-native-apppush': root,
      react: resolveFrom('react'),
      'react-native': resolveFrom('react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

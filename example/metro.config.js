const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');

/**
 * Resolves a package as Node would from the example directory.
 *
 * Hard-coding `example/node_modules/<name>` breaks under npm workspaces, which
 * hoists react and react-native to the repo root and leaves those paths missing.
 * Resolving instead finds whichever copy is actually there -- hoisted or, under
 * Yarn's `nmHoistingLimits: workspaces`, local -- and always the same one Node
 * would pick.
 */
const resolveFrom = (name) =>
  path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));

/**
 * Metro has to be told three things to run the example against the library source.
 *
 * 1. `watchFolders` -- the library lives outside the example, so Metro would not
 *    watch it and edits to src/ would not trigger a reload.
 * 2. `resolverMainFields` puts `source` first, so importing the package resolves
 *    to the root package.json's "source" (./src/index.tsx) rather than "main"
 *    (./lib/commonjs/index.js). Without it you would have to run `bob build`
 *    after every change -- and would silently test stale output.
 * 3. `extraNodeModules` pins react and react-native to a single resolved copy.
 *    The root has its own node_modules; two copies of React in one bundle is an
 *    immediate invalid-hook-call crash.
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
      // The library is not a node_modules entry -- it is aliased straight to the
      // repo root. Combined with `source` above, importing
      // 'appsonair-react-native-push' resolves to ../src/index.tsx. This is also
      // why example/package.json does not list it as a dependency: pointing a
      // workspace at its own root needs `link:`/`file:` syntax that npm and Yarn
      // disagree about, and none of it is necessary.
      'appsonair-react-native-push': root,
      react: resolveFrom('react'),
      'react-native': resolveFrom('react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

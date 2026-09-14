const path = require('path');
const pkg = require('../package.json');

/**
 * Points autolinking at the library in the parent directory.
 *
 * The `link:..` dependency in package.json already creates the node_modules
 * symlink, but autolinking resolving through a symlink is not reliable across
 * package managers -- naming the root explicitly is what the official library
 * template does, and it removes the ambiguity.
 */
module.exports = {
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..'),
    },
  },
};

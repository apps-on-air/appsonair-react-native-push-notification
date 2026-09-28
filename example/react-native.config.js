const path = require('path');
const pkg = require('../package.json');

/** Points autolinking at the library in the parent directory. */
module.exports = {
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..'),
    },
  },
};

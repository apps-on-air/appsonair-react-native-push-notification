module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {},
    },
  },
};

// No `spm` stanza: this package ships a podspec only. The sibling AppLink /
// AppSync / AppRemark wrappers declare one because they also ship an
// ios/Package.swift; adding the key without that manifest would advertise an
// SPM target that does not exist. See SPM_SUPPORT.md in AppRemark for the
// layout to copy if SPM support is added later.

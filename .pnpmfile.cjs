module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'tsx' && pkg.dependencies?.esbuild) {
        pkg.dependencies.esbuild = '^0.28.1';
      }

      if (pkg.name === 'exceljs' && pkg.dependencies?.uuid) {
        pkg.dependencies.uuid = '^11.1.1';
      }

      if (
        (pkg.name === 'xmlbuilder2' ||
          pkg.name === '@eslint/eslintrc' ||
          pkg.name === 'cosmiconfig') &&
        pkg.dependencies?.['js-yaml']
      ) {
        pkg.dependencies['js-yaml'] = '^4.1.2';
      }

      return pkg;
    },
  },
};

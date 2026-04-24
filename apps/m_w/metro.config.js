const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Force Metro to resolve from the mobile project first
config.projectRoot = projectRoot;

// 3. Absolute path resolution for pnpm symlinks
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 4. Critical for pnpm: Enable symlinks
config.resolver.unstable_enableSymlinks = true;

// 5. THE FIX: Resolve "index" correctly even if called from the root
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './index.ts' || moduleName === './index' || moduleName === 'index') {
    return {
      filePath: path.resolve(projectRoot, 'index.ts'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
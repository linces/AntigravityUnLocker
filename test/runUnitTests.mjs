import esbuild from 'esbuild';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('📦 Bundling unit tests with esbuild...');
  const outfile = path.join(__dirname, '../dist/test-bundle.cjs');
  const mockPath = path.join(__dirname, 'vscode-mock.ts');

  // Alias vscode module to vscode-mock.ts
  const aliasPlugin = {
    name: 'vscode-alias',
    setup(build) {
      build.onResolve({ filter: /^vscode$/ }, () => {
        return { path: mockPath };
      });
    },
  };

  await esbuild.build({
    entryPoints: [path.join(__dirname, 'all.test.ts')],
    bundle: true,
    outfile,
    platform: 'node',
    target: 'node18',
    plugins: [aliasPlugin],
  });

  console.log('🚀 Running Mocha test runner...');
  const child = spawn('npx', ['mocha', outfile], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

run().catch((err) => {
  console.error('Test build failed:', err);
  process.exit(1);
});

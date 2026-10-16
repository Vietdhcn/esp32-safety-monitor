import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const compiler = ['g++', 'clang++'].find(name => spawnSync(name, ['--version']).status === 0);

test('firmware safety logic passes host C++ checks', { skip: !compiler && 'no C++ compiler installed' }, () => {
  const source = fileURLToPath(new URL('./firmware-safety-logic.cpp', import.meta.url));
  const output = join(mkdtempSync(join(tmpdir(), 'safety-')), 'safety-logic');
  execFileSync(compiler, ['-std=c++17', '-Wall', '-Wextra', '-Werror', source, '-o', output]);
  const result = spawnSync(output, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

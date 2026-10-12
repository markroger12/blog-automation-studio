import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';

describe('globals.css', () => {
  it('compiles with Tailwind 4 and emits the shared component classes', async () => {
    const from = path.resolve('src/app/globals.css');
    const { css } = await postcss([tailwind()]).process(fs.readFileSync(from, 'utf8'), { from });
    for (const cls of ['.card', '.btn-primary', '.btn-secondary', '.btn-danger', '.input', '.label', '.table']) expect(css).toContain(cls);
  }, 30_000);
});

import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://alliance.edenafk.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({ title: z.string().min(1), date: z.coerce.date(), description: z.string().default(''), draft: z.boolean().default(false) }),
});
export const collections = { posts };

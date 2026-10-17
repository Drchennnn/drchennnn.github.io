import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({ title: z.string().min(1), date: z.coerce.date(), category: z.enum(['daily', 'study']).default('daily'), description: z.string().default(''), draft: z.boolean().default(false) }),
});
const safeImage = z.string().refine(value => {
  if (value.startsWith('/images/') && !/[\\\x00-\x1f]/.test(value)) {
    const url = new URL(value, 'https://blog.invalid');
    return url.pathname.startsWith('/images/');
  }
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}, '图片地址必须位于 /images/ 或使用 http(s) 地址');
const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos' }),
  schema: z.object({
    title: z.string().min(1), date: z.coerce.date(), description: z.string().default(''), draft: z.boolean().default(false),
    images: z.array(z.object({ image: safeImage, caption: z.string().default(''), alt: z.string().default('') })).min(1).max(50),
  }),
});
const toys = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/toys' }),
  schema: z.object({
    title: z.string().min(1), date: z.coerce.date(), description: z.string().default(''), draft: z.boolean().default(false),
    cover: safeImage,
    demo: z.string().regex(/^\/toys\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/, '作品地址须为 /toys/作品名/index.html'),
    tags: z.array(z.string().min(1)).max(6).default([]),
  }),
});
export const collections = { posts, photos, toys };

const fields = [
  { label: '标题', name: 'title', widget: 'string' },
  { label: '日期', name: 'date', widget: 'string', default: new Date().toLocaleDateString('sv-SE'), pattern: ['^\\d{4}-\\d{2}-\\d{2}$', '请使用 YYYY-MM-DD，例如 2026-10-15'] },
  { label: '摘要', name: 'description', widget: 'text', required: false, default: '' },
  { label: '隐藏文章（草稿）', name: 'draft', widget: 'boolean', default: false, hint: '只从网站隐藏；公开仓库的文件仍可被读取。' },
  { label: '正文', name: 'body', widget: 'markdown', hint: '可视化编辑或 Markdown；使用图片按钮上传图片。' },
];
let imported = false;
if (new URLSearchParams(location.search).get('import') === '1') {
  try {
    const data = JSON.parse(sessionStorage.getItem('byweb-import'));
    if (!data || typeof data.body !== 'string' || typeof data.title !== 'string') throw new Error('没有可导入的文章，请重新选择文件。');
    for (const field of fields) if (Object.hasOwn(data, field.name)) field.default = data[field.name];
    imported = true;
    location.hash = '#/collections/posts/new';
  } catch (error) { alert(error.message); }
}
CMS.registerEventListener({ name: 'preSave', handler: ({ entry }) => {
  const date = entry.getIn(['data', 'date']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('请输入有效日期，例如 2026-10-15。');
  return entry.get('data');
}});
CMS.registerPreviewStyle('/admin/preview.css');
CMS.init({ config: {
  load_config_file: false,
  backend: { name: 'github', repo: 'Drchennnn/drchennnn.github.io', branch: 'main', base_url: 'https://byweb-auth.drchennnn.workers.dev', auth_endpoint: 'auth', auth_scope: 'public_repo' },
  locale: 'zh_Hans', site_url: 'https://drchennnn.github.io', display_url: 'https://drchennnn.github.io',
  media_folder: 'public/images', public_folder: '/images',
  collections: [{ name: 'posts', label: '文章', label_singular: '文章', folder: 'src/content/posts', create: true, delete: true, extension: 'md', format: 'frontmatter', slug: '{{fields.date}}-{{slug}}', preview_path: 'posts/{{slug}}/', summary: '{{title}} · {{date}}', sortable_fields: ['date', 'title'], fields }],
}});
if (imported) CMS.registerEventListener({ name: 'postSave', handler: () => {
  sessionStorage.removeItem('byweb-import');
  location.replace('/admin/');
}});

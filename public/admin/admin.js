const fields = [
  { label: '标题', name: 'title', widget: 'string' },
  { label: '日期', name: 'date', widget: 'string', default: new Date().toLocaleDateString('sv-SE'), pattern: ['^\\d{4}-\\d{2}-\\d{2}$', '请使用 YYYY-MM-DD，例如 2026-10-15'] },
  { label: '文章分组', name: 'category', widget: 'select', default: 'daily', options: [{ label: '日々小记 · 日常与短文', value: 'daily' }, { label: '学び手帖 · 学习心得', value: 'study' }] },
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
const PhotoPreview = createClass({
  render() {
    const { entry, getAsset, widgetFor } = this.props;
    const images = entry.getIn(['data', 'images']);
    return h('article', {},
      h('h1', {}, entry.getIn(['data', 'title'])),
      h('p', { className: 'photo-date' }, entry.getIn(['data', 'date'])),
      h('p', {}, entry.getIn(['data', 'description'])),
      ...(images ? images.toArray().map((photo, index) => {
        const path = photo.get('image');
        return h('figure', { key: index },
          path ? h('img', { src: getAsset(path).toString(), alt: photo.get('alt') || photo.get('caption') || '' }) : null,
          h('figcaption', {}, photo.get('caption') || ''));
      }) : []),
      widgetFor('body'));
  },
});
CMS.registerPreviewTemplate('photos', PhotoPreview);
CMS.registerPreviewStyle('/admin/preview.css');
CMS.init({ config: {
  load_config_file: false,
  backend: { name: 'github', repo: 'Drchennnn/drchennnn.github.io', branch: 'main', base_url: 'https://byweb-auth.drchennnn.workers.dev', auth_endpoint: 'auth', auth_scope: 'public_repo' },
  locale: 'zh_Hans', site_url: 'https://drchennnn.github.io', display_url: 'https://drchennnn.github.io',
  media_folder: 'public/images', public_folder: '/images',
  collections: [{ name: 'posts', label: '文章', label_singular: '文章', folder: 'src/content/posts', create: true, delete: true, extension: 'md', format: 'frontmatter', slug: '{{fields.date}}-{{slug}}', preview_path: 'posts/{{slug}}/', summary: '{{title}} · {{date}}', sortable_fields: ['date', 'title'], fields },
    { name: 'photos', label: '光影拾遗', label_singular: '照片记录', folder: 'src/content/photos', create: true, delete: true, extension: 'md', format: 'frontmatter', slug: '{{fields.date}}-{{slug}}', preview_path: 'photos/{{slug}}/', summary: '{{title}} · {{date}}', sortable_fields: ['date', 'title'], fields: [
      ...fields.filter(field => ['title', 'date', 'description', 'draft'].includes(field.name)).map(field => {
        const copy = { ...field };
        // Imported article defaults belong only to the article collection.
        if (imported && ['title', 'description'].includes(copy.name)) delete copy.default;
        if (copy.name === 'date') copy.default = new Date().toLocaleDateString('sv-SE');
        if (copy.name === 'draft') copy.default = false;
        return copy;
      }),
      { label: '照片', label_singular: '照片', name: 'images', widget: 'list', min: 1, max: 50, summary: '{{fields.caption}}', fields: [
        { label: '上传照片', name: 'image', widget: 'image', allow_multiple: false },
        { label: '照片小字', name: 'caption', widget: 'string', required: false, default: '', hint: '显示在照片下方，可记录地点、心情或一句话。' },
        { label: '图片描述', name: 'alt', widget: 'string', required: false, default: '', hint: '简述画面，方便使用屏幕阅读器的访客。' },
      ] },
      { label: '补充文字', name: 'body', widget: 'markdown', required: false },
    ] },
  ],
}});
if (imported) CMS.registerEventListener({ name: 'postSave', handler: () => {
  sessionStorage.removeItem('byweb-import');
  location.replace('/admin/');
}});

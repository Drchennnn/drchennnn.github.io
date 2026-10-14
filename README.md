# 日常手帖

Drchennnn 的简洁个人博客，基于 Astro，发布于 https://drchennnn.github.io/ 。

## 写文章（不需要本地命令）

打开 https://drchennnn.github.io/manage/ ，下载文章模板，用文本编辑器修改后保存为新的英文文件名，例如 `my-note.md`。

点击“上传文章”，使用有写入权限的 GitHub 账号登录，上传至 `src/content/posts/` 并提交到 `main`。GitHub Actions 成功后，文章会出现在首页，点击可查看全文。

文件格式：

```markdown
---
title: "文章标题"
date: 2026-10-15
description: "文章摘要"
draft: false
---
正文写在这里。
```

删除：在管理页点击“查看 / 删除文章”，打开对应文件，选择文件菜单中的 Delete file 并提交。下次部署会同时移除列表与详情页，旧链接返回 404。
编辑：打开文章文件，点击铅笔修改并提交。文件名决定文章网址，尽量不要随意改名。
图片：上传到 `public/images/`，正文引用 `![说明](/images/photo.jpg)`。
草稿：`draft: true` 隐藏站点中的文章；公开仓库源码仍可见。日期用于排序，不作为定时发布开关。
`welcome.md` 是可删除的示例文章。

## 修改个人网页

- `src/pages/about.astro`：个人介绍
- `src/pages/index.astro`：首页介绍和列表
- `src/layouts/Base.astro`：网站名称、导航和页脚
- `src/styles/global.css`：颜色与排版

## 本地开发

需要 Node.js >=22.12.0，建议 Node.js 24。

```sh
npm ci
npm run dev
npm run build
npm test
```

`npm test` 临时添加文章验证发布、详情页、草稿和删除，结束后移除测试文件。不要和正在写作或构建的另一个进程同时运行。

## 部署

Pages 的 Source 选择 GitHub Actions。每次推送 main，由 `.github/workflows/deploy.yml` 构建并部署 dist。
构建失败时查看仓库 Actions，检查 Markdown 头部日期和标题等字段；之前发布的版本保持可访问。

网站没有独立登录后台。文章管理使用 GitHub 的认证与文件操作，不在前端保存访问令牌。

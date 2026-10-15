# 日常手帖

Link 的简洁个人博客，基于 Astro，发布于 https://drchennnn.github.io/ 。

## 分组与搜索

- **日々小记**：日常、短文和零碎想法。文章 `category: daily`；旧文章没有此字段时也属于这里。
- **学び手帖**：学习心得。文章 `category: study`。
- **光影拾遗**：照片记录。后台选择同名集合，新建记录，上传 1–50 张照片；每张可填照片小字和无障碍图片描述，另可填写补充正文。
- **玩心造物**：自己做的动画、交互实验和好玩的小玩意。列表使用封面卡片，点击进入带有内嵌演示的作品详情页。
- 导航进入各分组；搜索覆盖已发布文章正文、照片说明和作品信息。隐藏草稿不进入站点搜索索引。
- 照片记录保存在 `src/content/photos/`，图片上传至 `public/images/`。删除照片记录不会自动删除媒体库图片，以免影响其他文章；媒体库图片需另行管理。

## 添加小玩意

每件作品由一份 Markdown 元数据、一个独立 HTML 演示和一张封面组成。作品文件名就是详情页地址中的 slug，只使用小写英文字母、数字和连字符，例如 `pelican-ride.md` 对应 `/play/pelican-ride/`。

作品元数据保存在 `src/content/toys/`：

```markdown
---
title: "作品标题"
date: 2026-10-15
description: "一句话介绍这个小玩意，可留空。"
draft: false
cover: /images/toys/pelican-ride.svg
demo: /toys/pelican-ride/index.html
tags:
  - SVG
  - 动画
---
这里写创作说明、操作方法或实现笔记。
```

本地新增作品：

1. 把可独立运行的 HTML 及其资源放入 `public/toys/<slug>/`，入口必须是 `index.html`。
2. 把封面放入 `public/images/`（可以按作品继续分目录），在 `cover` 中填写以 `/images/` 开头的地址；也支持 `http(s)` 图片地址。
3. 在 `src/content/toys/` 新建同名 Markdown，`demo` 必须填写 `/toys/<slug>/index.html`，并确保 slug 只含小写字母、数字和连字符。
4. 本地运行 `npm run dev` 检查卡片、详情和演示，再提交到 Git。部署后公开作品也会进入站内搜索。

在线后台可以新建和编辑作品的标题、日期、摘要、封面、演示地址、标签、正文与草稿状态。HTML 演示不通过 CMS 上传或编辑，仍需在本地或 GitHub 中放入 `public/toys/<slug>/` 后提交。删除作品元数据不会自动删除 HTML 演示与封面资源。

鹈鹕动画已接入页脚“暂停动效”和系统“减少动态效果”设置。以后新增动画可参照 `public/toys/pelican-ride/index.html`：只接受来自 `parent` 的 `journal:motion` 消息，用 `paused` 布尔值控制播放；向父页发送 `toy:ready`，并用 `toy:resize` 的 `height` 字段报告内容高度，让详情页自动适配。未接入消息协议的独立 HTML 仍可嵌入，但需自行处理暂停与高度。

作品演示使用仅允许脚本的 iframe 沙箱。`draft: true` 隐藏作品列表、详情与搜索，不会隐藏 `public/` 下的 HTML 或封面。

## 写文章（也可直接通过 GitHub 管理）

打开 https://drchennnn.github.io/manage/ ，下载文章模板，用文本编辑器修改后保存为新的英文文件名，例如 `my-note.md`。

点击“上传文章”，使用有写入权限的 GitHub 账号登录，上传至 `src/content/posts/` 并提交到 `main`。GitHub Actions 成功后，文章会出现在首页，点击可查看全文。

文件格式：

```markdown
---
title: "文章标题"
date: 2026-10-15
category: daily
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

## 庭院动效

首页圆窗庭院采用四层 SVG，鼠标移动时产生轻微景深；风铃的吊线与铃身共同摆动，点击可再借一阵风。
全站宽屏留白都点缀六片淡樱花，随滚动轻轻下落、横移与转动，停下滚动后逐渐静止。首页纸面跟随阅读区块变换色温，文章、作品与其他页面按实际滚动进度从雾色过渡到苔色、暮色；没有滚动空间时保持初始色。小屏把首页庭院放到介绍下方，隐藏全站两侧装饰；触摸操作不触发鼠标视差。
页脚“暂停动效”会记住当前选择；系统开启“减少动态效果”时自动使用静态画面。

- `src/components/HeroGarden.astro`、`MarginParallax.astro`：手绘 SVG
- `src/components/JournalMotion.astro`：鼠标、滚动与暂停逻辑
- `src/styles/garden.css`：庭院布局和背景过渡

## 本地开发

需要 Node.js >=22.12.0，建议 Node.js 24。

```sh
npm ci
npm run dev
npm run build
npm test
```

`npm test` 临时添加文章、照片与作品，验证发布、详情页、搜索、草稿、作品 iframe 沙箱、删除和站内链接，结束后移除测试文件。不要和正在写作或构建的另一个进程同时运行。

## 部署

Pages 的 Source 选择 GitHub Actions。每次推送 main，由 `.github/workflows/deploy.yml` 构建并部署 dist。
构建失败时查看仓库 Actions，检查 Markdown 头部日期和标题等字段；之前发布的版本保持可访问。

网站前台由 GitHub Pages 托管；在线后台通过 GitHub 登录获取仓库写入权限。

## 在线管理

打开 https://drchennnn.github.io/admin/ ，使用 Drchennnn 的 GitHub 账号登录。
- 新建/编辑：填写标题、日期、文章分组、摘要和正文，支持可视化编辑及 Markdown，保存后等待 GitHub Actions 发布。
- 作品：后台可维护“玩心造物”的元数据和说明；HTML 演示仍需通过本地或 Git 提交到 `public/toys/<slug>/`。
- 导入：顶部“导入 Markdown”读取 .md 的 frontmatter 与正文，先预览再进入编辑器；最多 500 KB。本地图片须另外上传。
- 图片：正文图片按钮或媒体库上传至 public/images。
- 删除：打开文章后使用删除操作并确认；Git 历史保留，可恢复。
- 隐藏草稿只从网站移除，公开仓库文件与提交历史仍可见。

OAuth 代码在 worker/src/index.js；配置及部署见 worker/README.md。后台仅请求 public_repo 权限（GitHub OAuth 的该权限适用于账号可写的公共仓库，不能限定单个仓库）；服务额外核对账号和本博客写权限。首次授权请核对应用名称和权限。

编辑器固定使用 Decap CMS 3.17.1，构建时从本地 npm 包复制静态文件，无需运行额外 CMS 服务器。`npm run test:oauth` 验证登录失败和权限边界；`npm run test:admin` 验证导入。第三方 Decap 依赖当前存在 npm 审计告警（包括旧 Markdown 解析器的拒绝服务风险）；只导入可信文件，升级时需重新验证。导入器单独使用修复版本 js-yaml 5.4.3。

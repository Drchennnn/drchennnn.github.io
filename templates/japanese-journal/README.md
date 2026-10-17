# 日常手帖 · 原版日系模板

保存于 2026-10-18，改版前基线 commit 为 `0b71f2a`。包含原版 Astro 页面、布局、组件、样式、内容配置及 favicon。`src/content` 是保存时的文章快照，仅供恢复核对；切换外观时不要覆盖当前内容。

在博客仓库根目录恢复外观（先提交或保存当前修改）：

```sh
cp -R templates/japanese-journal/src/components/. src/components/
cp -R templates/japanese-journal/src/layouts/. src/layouts/
cp -R templates/japanese-journal/src/pages/. src/pages/
cp -R templates/japanese-journal/src/styles/. src/styles/
cp templates/japanese-journal/public/favicon.svg public/favicon.svg
npm run build
```

模板沿用当前仓库的 `/images`、`/toys`、Decap CMS 和 OAuth 服务。不要用模板覆盖 `public/admin`、`src/content` 或线上配置。无新增依赖；原始版本供查阅的 package.json 保存为 package-reference.json。恢复时新增的 Café 组件可以留置，原模板不引用它们。

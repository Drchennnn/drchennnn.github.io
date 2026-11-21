# 每日碎片

公开博客的 `/fragments/` 是入口。独立的 Cloudflare Worker 验证 GitHub 身份，并在请求时读取 `Drchennnn/daily-fragments`。日记、图片及搜索索引来自私有仓库。Astro 的 Pages 构建无需任何日记凭证。

## 部署与首次登录

1. 用 Wrangler 登录有 `drchennnn.workers.dev` 子域的 Cloudflare 账号。从博客根目录部署。
   ```sh
   npx --yes wrangler@4.166.0 deploy --config worker/daily-fragments/wrangler.toml
   ```
2. 在 GitHub 注册专用 OAuth App。主页是 `https://daily-fragments.drchennnn.workers.dev/`，唯一回调是 `https://daily-fragments.drchennnn.workers.dev/callback`。保留令牌过期，关闭通配符与 Device Flow。生成 Client Secret。Worker 只用 OAuth 令牌核实账号 ID，登录后使用 12 小时会话。
3. 在 GitHub 生成 **fine-grained PAT**。Repository access 选 **Only select repositories**，只勾选 `daily-fragments`。仓库权限只需 **Contents: Read and write** 和 GitHub 自动附带的 **Metadata: Read**。选定到期日，届时为 Worker 换发令牌。
4. 在终端运行 `bash worker/daily-fragments/configure.sh`。按提示填写 Client ID、Client Secret 和细粒度 PAT。脚本生成会话签名密钥，并把四个值写入 Worker 的加密 Secrets。重新运行会使现有会话失效。
5. 用 GitHub 登录日记，核对日期列表、照片、月度回顾和搜索。用另一个匿名浏览器访问入口及某张照片地址，确认照片请求返回 401。公开博客入口的发布随 PR 合并到 `main` 触发。

到期只更换归档令牌时，运行以下命令并在 Wrangler 提示时输入新值，随后撤销旧令牌。

```sh
npx --yes wrangler@4.166.0 secret put ARCHIVE_TOKEN --config worker/daily-fragments/wrangler.toml
```

Worker 的所有响应禁止缓存和索引。保留 `preview_urls = false`、专用 OAuth App、当前仓库访问范围和 GitHub 数字 ID 白名单。部署后可执行 `node --test scripts/test-fragments-*.mjs` 检查匿名读取、错误账号、无效会话、并发保存和图片上传。

## 每天和 Lumi 一起记日记

在有浏览器能力的 ChatGPT Work 聊天中发文字和照片，然后说：

> Lumi，把我这次发的文字按香港时间整理成一篇每日碎片，保留我的语气。打开 https://daily-fragments.drchennnn.workers.dev/new，把日期、标题、正文和能上传的原图填进表单并保存。以页面显示「已保存到私人日记」为准，回报日期、标题和实际保存的照片张数。照片无法交给浏览器时，告诉我哪些要手动上传。

根据 Work 的提示完成网站权限和 GitHub 登录。每次保存由该聊天中的指令触发。如果 Work 取不到原始附件，先让 Lumi 给出标题和正文，再在同一个表单选取本机原图和保存。希望文字与照片在同一个提交里时，可以让 Lumi 填好表单，把上传和最后保存留给你。

写入入口是仅同源登录可用的 `POST /entries`，使用 multipart 字段 `date`、`title`、`body`、表单生成的 `nonce` 及可选的 `photos`。一次提交包含正文、照片及两个索引。相同表单重复提交遇到网络重试时不会重复生成同一条记录。图片支持 JPEG、PNG、WebP 和 GIF，最多 4 张，每张 5 MB，合计 10 MB。

[ChatGPT Work 云浏览器](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt) · [ChatGPT GitHub 连接器权限](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt)

## 归档格式

- `diary/YYYY/MM/*.md` 保存可移植的 UTF-8 Markdown。日记页把正文作为文本显示，防止归档中的 HTML 或外链自动执行或加载。
- `photos/YYYY/MM/*` 保存原始照片。浏览器只收到经过登录检查的同源图片响应。
- 根目录 `index.json` 是项目列表。日期浏览按月份过滤，搜索范围可选一个月或一个自然年。正文搜索只读取该范围内的私有 `search/YYYY-MM.json`。
- `summaries/YYYY-MM.md` 可补充手写或 Lumi 整理的月度回顾。每月页面会从索引自动统计篇数、记录天数和照片数。

未来做 RAG 时，可从私有 Markdown 和图片构建独立索引。Git 历史也包含旧版日记，更正归档可以通过私有仓库提交。手动改动时，请同步更新目录中的 `index.json` 和相关 `search/YYYY-MM.json`，避免显示和检索内容不同步。

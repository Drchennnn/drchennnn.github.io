#!/usr/bin/env bash
set -euo pipefail

config="$(cd "$(dirname "$0")" && pwd)/wrangler.toml"
wrangler=(npx --yes wrangler@4.166.0)
printf '此脚本把三个凭证写入 daily-fragments Worker 的加密 Secrets。\n'
read -rp 'GitHub OAuth Client ID: ' client_id
read -rsp 'GitHub OAuth Client Secret（输入隐藏）: ' client_secret
printf '\n'
read -rsp 'GitHub fine-grained PAT（输入隐藏）: ' archive_token
printf '\n'
if [[ -z "$client_id" || -z "$client_secret" || "$archive_token" != github_pat_* ]]; then
  printf '凭证格式不符，确认使用 Fine-grained token。\n' >&2
  exit 1
fi

session_secret="$(openssl rand -hex 32)"
# Keep the values out of command arguments, terminal output, and files.
printf '%s\n' "$client_id" "$client_secret" "$archive_token" "$session_secret" |
  node -e '
    const [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ARCHIVE_TOKEN, SESSION_SECRET] =
      require("node:fs").readFileSync(0, "utf8").split("\n");
    process.stdout.write(JSON.stringify({GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ARCHIVE_TOKEN, SESSION_SECRET}));
  ' |
  "${wrangler[@]}" secret bulk --config "$config"

printf '配置完成。日记登录 https://daily-fragments.drchennnn.workers.dev/login\n'

#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 || ! -t 1 ]]; then
  printf '请在 Mac 终端中直接运行此脚本。\n' >&2
  exit 1
fi

config="$(cd "$(dirname "$0")" && pwd)/wrangler.toml"
wrangler=(npx --yes wrangler@4.166.0)
identity="$("${wrangler[@]}" whoami)"
if [[ "$identity" == *"You are not authenticated"* ]]; then
  printf '此终端需要先登录 Cloudflare，请在弹出的网页完成授权。\n'
  "${wrangler[@]}" login --use-keyring --scopes account:read user:read workers_scripts:write
fi

# Check deployment access before asking the owner to paste any secret.
"${wrangler[@]}" secret list --config "$config"
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
umask 077
scratch="$(mktemp -d "${TMPDIR:-/tmp}/daily-fragments.XXXXXXXX")"
writer=''
cleanup() {
  if [[ -n "$writer" ]]; then kill "$writer" 2>/dev/null || true; fi
  rm -f "$scratch/input"
  rmdir "$scratch"
}
trap cleanup EXIT
mkfifo "$scratch/input"

# A named pipe keeps Wrangler interactive and keeps secrets off disk and out of process arguments.
(
  printf '%s\n' "$client_id" "$client_secret" "$archive_token" "$session_secret" |
    node -e '
      const [GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ARCHIVE_TOKEN, SESSION_SECRET] =
        require("node:fs").readFileSync(0, "utf8").split("\n");
      process.stdout.write(JSON.stringify({GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ARCHIVE_TOKEN, SESSION_SECRET}));
    '
) >"$scratch/input" &
writer=$!
"${wrangler[@]}" secret bulk "$scratch/input" --config "$config"
wait "$writer"
writer=''
printf '配置完成。日记登录 https://daily-fragments.drchennnn.workers.dev/login\n'

# BYweb OAuth Worker

This Worker is the GitHub OAuth bridge used by Decap CMS at
`https://drchennnn.github.io/admin/`.

Required production bindings:

- `GITHUB_CLIENT_ID` — text variable
- `GITHUB_CLIENT_SECRET` — encrypted secret
- `ALLOWED_ORIGIN=https://drchennnn.github.io` — text variable
- `ALLOWED_USER=Drchennnn` — text variable

The GitHub OAuth App callback must be exactly:

```text
https://byweb-auth.drchennnn.workers.dev/callback
```

Deploy from the repository root with:

```sh
npx wrangler deploy --config worker/wrangler.toml
```

`keep_vars = true` prevents a Wrangler deployment from deleting variables that
were created in the Cloudflare dashboard. Never put the client secret in this
repository or in `wrangler.toml`.

For a dashboard-only update, paste the complete contents of `src/index.js` into
the Worker's editor and deploy. The code intentionally requests only GitHub's
`public_repo` scope and releases a token only after checking the exact GitHub
username and push access to `Drchennnn/drchennnn.github.io`.


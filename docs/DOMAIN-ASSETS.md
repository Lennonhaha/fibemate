# Domain assets

Status: current as of 2026-11-26.

## What we hold

| Domain | Role | Where it points | Certificate |
|---|---|---|---|
| `fibemate.net` | primary site | this host (A record `<server-ip>`) | Let's Encrypt, `fibemate.net` + `www.fibemate.net`, valid to 2027-02-13 |
| `fibemate.link` | brand asset, **redirect only** | same host (A record `<server-ip>`) | Let's Encrypt, `fibemate.link`, valid to 2027-01-07 |

`fibemate.link` is kept for two reasons: it is cheap to keep, and it preserves the
option of switching to it if `.net` ever becomes unusable (DNS, filing, or access
problems). Keeping the name is an option, not a deployment.

## What `.link` does today

`/etc/nginx/sites-enabled/fibemate.link` is redirect-only, for both HTTP and HTTPS:

```
server_name fibemate.link www.fibemate.link;
listen 80            -> return 301 https://fibemate.net$request_uri
listen 8443 ssl ...  -> return 301 https://fibemate.net$request_uri
```

No site content is served from `.link`. It is not a mirror, has no separate
document root, and is not a second copy of the release tree.

A probe that reports "200, 215 KB" for `https://fibemate.link` has followed the
301 and is describing `fibemate.net`. The `.link` response itself is a 301 with
an empty body. This matters because "there is a second live copy" and "there is a
redirect" call for opposite kinds of work: the first needs a sync pipeline and a
second certificate lifecycle, the second needs nothing.

## What we deliberately do not do

- No second server block serving content, no shared-root mirror.
- No `canonical` tag work: there is no duplicate to disambiguate while `.link`
  redirects.
- No double deploy. One release tree, one deployment, both names covered.

If `.net` ever needs to be replaced, `.link` becomes a real site at that point:
add a content server block against the same release tree, add `canonical`, and
only then worry about cross-domain SEO. Doing it now buys nothing and adds a
second thing that can silently fall out of date.

## Re-evaluate when

- `.net` resolution fails, or the certificate for `.net` cannot be renewed.
- `.net` becomes unreachable in a region that matters to users.
- The domain is needed for something other than a redirect.

## Renewal

Both certificates renew through `certbot.timer` (twice daily). `.link` uses the
DNS-01 challenge with the `dns-aliyun` plugin and `/etc/letsencrypt/aliyun.ini`;
`.net` renews separately. Both renewal configs use `renew_before_expiry = 30 days`.

A dry run on 2026-11-26 succeeded end to end:

```
certbot renew --cert-name fibemate.link --dry-run
Congratulations, all simulated renewals succeeded
```

That is the check that matters: not "renewal is configured", but "renewal works
today". Configuration that has never been exercised is a guess.

## Expiry monitoring

`scripts/cert-expiry-check.sh` reads every certificate under
`/etc/letsencrypt/live`, reports the days left, and exits non-zero inside the
warning window (30 days by default, 7 days hard). It is meant to run daily from
cron with `--notify`.

One thing to know about the notification path: DingTalk returns **HTTP 200 even
when it rejects the message**, with `{"errcode":300005,"errmsg":"token is not
exist"}` in the body. A sender that checks only the status code will report
success for a dead channel. The script requires `"errcode":0`; on 2026-11-26 the
webhook stored in `/opt/fibemate/shared/.env` returned `300005`, so the channel
is currently dead and the script exits 3 rather than claiming delivery. Fixing
that needs a fresh webhook URL from the DingTalk admin console.

# Analytics

Self-hosted [Umami](https://umami.is) tracks the marketing site and the console
as one funnel. Cookie-less, no consent banner needed. Nothing loads unless the
env vars below are set at build time.

## Setup

1. Run Umami (Docker, Postgres) at `analytics.canonn.ai`. Create one website for
   `canonn.ai` and copy its website id.
2. Set repository variables `UMAMI_SCRIPT_URL` and `UMAMI_WEBSITE_ID` in GitHub.
   The deploy workflow passes them to both builds.
3. Locally: `PUBLIC_UMAMI_*` in `.env` (site), `VITE_UMAMI_*` in `dash-src/.env`.

## Funnel

Events are named in order of the developer journey. Names are stable; dashboards
and the deck key on them.

| Event | Where | Data |
|---|---|---|
| `pricing_view` | site, `#plans` scrolled into view | |
| `signup_click` | site, every CTA to `/dashboard/` | `placement` |
| `signup_completed` | console, first session of a new Clerk user | `utm_source`, `referrer`, `landing` |
| `playground_message` | console, a message sent | `grounded`, `sources` |
| `api_key_created` | console | |
| `assistant_created` | console | `sources`, `white_label` |
| `card_saved` | console | |
| `credit_added` | console | `amount_usd` |

Page views (site pages, console `#screen` changes) are automatic. Console views
carry the tag `dashboard`.

## Identity and attribution

- On sign-in the console calls `umami.identify(clerkUserId)`, so site visits and
  console events join on one id.
- The site writes a first-party `cn_attr` cookie (first touch: utm_*, referrer,
  landing page, 90 days). On the first sign-in it is copied to the Clerk user as
  `unsafeMetadata.attribution` and stays with the account, so API usage on the
  backend can be joined to acquisition source by Clerk user id.

## Backend join (canonn-lab, edge worker)

API usage itself is not tracked by Umami. The source of truth is the
`canonn_usage` request log in D1. The console also calls
`POST /v1/me/attribution` once per browser session, which creates the
account's row in `canonn_accounts` (first_seen + first-touch source, written
once). `GET /v1/admin/metrics?weeks=8` (ADMIN_KEY) joins the two and returns:

- `weekly` - active accounts, requests, tokens, spend per week (growth chart)
- `cohorts` - per signup week: signups, activated, activation rate, median
  hours to first call, retained w1-w4, spend
- `by_source` - signups, activated, spend per utm_source / referrer / direct

Those three objects are the weekly one-pager and the deck.

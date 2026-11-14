# CriticApp Deployment Guide

This document covers the current production deployment path for CriticApp.

Production path: Kubernetes on k3s with Traefik ingress and GitHub Actions deployment.

## Deployment Overview

CriticApp runs on the following production components:

- k3s for orchestration
- Traefik ingress for HTTP and HTTPS routing
- cert-manager and Let's Encrypt for TLS certificates
- Postgres in-cluster deployment and service
- Django app deployment served by Gunicorn
- WhiteNoise for static asset delivery from app containers
- Frontend deployment: nginx serving the built React app (`frontend/`)
- Beszel on the host for machine monitoring, and a staff-only API usage page with Telegram quota alerts (see [Monitoring](#monitoring))
- GitHub Actions workflow at `.github/workflows/deploy-k8s.yml`

Routing on the main Ingress (`k8s/ingress.yaml`), all on one domain:

- `/api` → `criticapp-web` (Django: the API, `/api/admin/`, `/api/usage/`)
- `/` → `criticapp-frontend` (everything else, including deep links)
- `/metrics` → blocked (403) by a higher-priority Ingress
- `/health/` has no public route; it is only used by the pod probes
- HTTP redirects to HTTPS at Traefik (`redirect-https` middleware)

Traefik orders routers by rule length by default, so `/api` wins over `/`.

## Prerequisites

- A Linux server with k3s installed
- kubectl access to the cluster namespace
- A DNS record pointing your domain to the k3s ingress endpoint
- GitHub repository access to configure Actions secrets

## Required Configuration

### Kubernetes Secret

Create a deployment secret from `k8s/secret.example.yaml` and fill all `replace-me` values.

Required keys:

- `SECRET_KEY`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `OMDB_API_KEY`
- `IGDB_CLIENT_ID`
- `IGDB_CLIENT_SECRET`
- `MAL_CLIENT_ID`

Optional keys (quota alerts, see [Monitoring](#monitoring)):

- `ALERT_TELEGRAM_BOT_TOKEN`
- `ALERT_TELEGRAM_CHAT_ID`

Apply it:

```bash
kubectl apply -f k8s/namespace.yaml
cp k8s/secret.example.yaml k8s/secret.yaml
# edit k8s/secret.yaml with real values
kubectl apply -f k8s/secret.yaml
```

### GitHub Actions Secrets

The deployment workflow requires:

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS`
- `APP_DOMAIN`
- `ALLOWED_HOSTS` (optional but recommended)
- `CSRF_TRUSTED_ORIGINS` (optional but recommended)
- `LETSENCRYPT_EMAIL` (required if workflow should apply ClusterIssuer)

### GitHub Actions Variables

The deployment workflow also requires this repository **variable** (Settings → Secrets and variables → Actions → Variables, not a secret):

- `VITE_OWNER_USERNAME`: the username whose reviews the site shows. It is baked into the frontend image at build time. The deploy fails before building anything if it is empty.

The frontend image is pushed to `ghcr.io/batman-nair/criticapp-frontend`. Like the web image, the cluster pulls it without credentials, so the GHCR package must be public. GitHub may create it as private on the first push; then the frontend rollout fails with `ImagePullBackOff` (prod keeps its previous routing). Make the package public and re-run the deploy.

### Integration Test Workflow Secrets

The integration test workflow (`.github/workflows/integration.yml`) requires:

- `OMDB_API_KEY`
- `IGDB_CLIENT_ID`
- `IGDB_CLIENT_SECRET`
- `MAL_CLIENT_ID`

`IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are the client ID and secret of an app registered in the [Twitch developer console](https://dev.twitch.tv/console).

## First Deployment (Manual Bootstrap)

Install cert-manager once per cluster:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.18.2/cert-manager.yaml
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=180s
kubectl wait --for=condition=Available deployment/cert-manager-cainjector -n cert-manager --timeout=180s
```

Apply base manifests:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl apply -f k8s/middleware.yaml
```

Set host-specific values in the ConfigMap for production routing:

```bash
kubectl create configmap criticapp-config -n criticapp \
  --from-literal=DJANGO_SETTINGS_MODULE=critic.settings.production \
  --from-literal=ALLOWED_HOSTS="reviews.example.com,127.0.0.1,localhost,criticapp-web,criticapp-web.criticapp.svc.cluster.local" \
  --from-literal=CSRF_TRUSTED_ORIGINS="https://reviews.example.com" \
  --from-literal=SECURE_SSL_REDIRECT="True" \
  --from-literal=SESSION_COOKIE_SECURE="True" \
  --from-literal=CSRF_COOKIE_SECURE="True" \
  --from-literal=WHITENOISE_MAX_AGE="31536000" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
```

Sign-ups through `POST /api/auth/register/` are off by default. To allow them,
add `--from-literal=REGISTRATION_ENABLED="True"` to the ConfigMap, and to the
same `kubectl create configmap` step in `.github/workflows/deploy-k8s.yml`:
every deploy rebuilds the ConfigMap from that list, so a value set only by hand
is lost on the next push.

Apply issuer and ingress with your domains:

```bash
sed "s|__LETSENCRYPT_EMAIL__|you@example.com|g" k8s/clusterissuer.yaml | kubectl apply -f -
sed "s|__APP_DOMAIN__|reviews.example.com|g" k8s/ingress.yaml | kubectl apply -f -
```

Run migrations:

```bash
kubectl delete job criticapp-migrate -n criticapp --ignore-not-found
kubectl apply -f k8s/migration-job.yaml
kubectl wait --for=condition=complete job/criticapp-migrate -n criticapp --timeout=300s
```

Verify deployment:

```bash
kubectl get pods -n criticapp
kubectl get svc -n criticapp
kubectl get ingress -n criticapp
kubectl get certificate -n criticapp
```

## Automated Deployments (GitHub Actions)

On every push to `master`, `.github/workflows/deploy-k8s.yml` does the following:

1. Checks that the `VITE_OWNER_USERNAME` repository variable is set
2. Builds and pushes the web and frontend images to GHCR
3. Uploads `k8s/` manifests to the target server over SSH
4. Applies core Kubernetes resources
5. Creates or updates `criticapp-config` ConfigMap from workflow values
6. Applies the optional ClusterIssuer and the Traefik middlewares
7. Runs migration job with the new image
8. Rolls out `criticapp-web` with zero-downtime strategy
9. Rolls out `criticapp-frontend`
10. Applies the ingress resources, last, so routing only changes once both rollouts are healthy

## Configuration Source of Truth

`criticapp-config` is managed by the GitHub Actions deployment workflow during normal deployments.

This means:

- Workflow-provided ConfigMap values are authoritative for CI/CD deployments.
- `k8s/configmap.yaml` is useful for manual/bootstrap workflows.
- If both are used, the last apply operation wins.

Recommended operational rule:

- Use workflow secrets and workflow deployment for regular production changes.
- Use `k8s/configmap.yaml` only for explicit manual operations.

## Runtime Operations

### Health and Metrics

Application endpoints:

- `/health/` for readiness and liveness (pod-internal; no public route)
- `/metrics/` Prometheus-format metrics (blocked at the ingress; nothing scrapes it since the move to Beszel)
- `/api/usage/` staff-only page with external API usage against quotas

The frontend pod's probes use nginx's `/healthz` on port 8080.

Useful checks:

```bash
kubectl get deployment criticapp-web criticapp-frontend -n criticapp
kubectl rollout status deployment/criticapp-web -n criticapp --timeout=300s
kubectl rollout status deployment/criticapp-frontend -n criticapp --timeout=300s
kubectl logs -n criticapp deploy/criticapp-web --tail=200
kubectl logs -n criticapp deploy/criticapp-frontend --tail=200
```

### Rollback of the frontend cutover

Revert the cutover PR on `master`. The next deploy re-applies the old Ingress, so `/` goes back to Django (the old pages stay until #58's cleanup). `/api/...` works either way.

`kubectl apply` doesn't delete objects, so the frontend pod and the redirect middleware stay behind. Remove them by hand, **only after the revert's deploy has finished** and the old Ingress is applied:

```bash
kubectl delete deployment,service criticapp-frontend -n criticapp
kubectl delete middleware redirect-https -n criticapp
```

Deleting the middleware while the new Ingress still references it makes Traefik drop the router, and the whole site returns 404.

### Refresh Review Item Metadata

CronJob manifest: `k8s/refresh-cronjob.yaml`

Apply or update:

```bash
kubectl apply -f k8s/refresh-cronjob.yaml
```

Verify jobs:

```bash
kubectl get cronjob criticapp-refresh-review-items -n criticapp
kubectl get jobs -n criticapp --sort-by=.metadata.creationTimestamp
kubectl logs -n criticapp job/<latest-job-name>
```

### Postgres Backup and Restore

Backup:

```bash
kubectl exec -n criticapp deploy/criticapp-postgres -- \
  pg_dump -U criticuser -d criticdb -Fc > criticapp_$(date +%Y%m%d_%H%M%S).dump
```

Restore:

```bash
kubectl exec -i -n criticapp deploy/criticapp-postgres -- \
  pg_restore -U criticuser -d criticdb --clean --if-exists < criticapp_backup.dump
```

### Map old RAWG games to IGDB (one-off)

Games come from IGDB. Games reviewed before the switch still point at `rawg_` items. Those items stay viewable, but the refresh CronJob skips them, and the "Reviewed" badge and duplicate detection don't match them to IGDB games. `map_rawg_to_igdb` moves their reviews to IGDB items.

Before the deploy that switches to IGDB, add `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` to `criticapp-secrets` and to the GitHub Actions secrets. Without them, game search, game refresh and the integration tests fail.

1. Back up before data fixes:

   ```bash
   kubectl exec -n criticapp deploy/criticapp-postgres -- \
     pg_dump -U criticuser -d criticdb -Fc > criticapp_$(date +%Y%m%d_%H%M%S).dump
   ```

2. Dry run (writes nothing). It prints one line per `rawg_` item with reviews, the proposed IGDB item and a status:

   ```bash
   kubectl exec -n criticapp deploy/criticapp-web -- python manage.py map_rawg_to_igdb
   ```

   | Status | Meaning | What to do |
   |---|---|---|
   | `MATCH` | One IGDB game with the same title and year | Nothing, `--apply` maps it |
   | `CHECK` | Same title but the year is off by one or unknown, or the title matches only without its subtitle | Check it, then `--map` or `--skip` |
   | `AMBIGUOUS` | Several plausible games, listed as `candidate` lines | `--map` the right one, or `--skip` |
   | `NOT_FOUND` | Nothing in the normal games search | See the `hint` lines, then `--map` or `--skip` |

   `NOT_FOUND` rows list `hint igdb_<n> ...` lines from an unfiltered search that includes DLC and expansions. Their ids go straight into `--map`.

3. Apply. `MATCH` rows are mapped automatically. Every other row needs `--map` (which also overrides a `MATCH`) or `--skip`, both repeatable. Rows with neither are left alone and reported:

   ```bash
   kubectl exec -n criticapp deploy/criticapp-web -- python manage.py map_rawg_to_igdb --apply --map rawg_123=igdb_456 --skip rawg_789
   ```

   It ends with `mapped= skipped= conflicts= left=`.

Notes:

- Each item is mapped in its own transaction. Reviews keep their dates, so the "Recently updated" order doesn't change. The `rawg_` item is deleted once no review points at it.
- If a user already reviewed the target IGDB game, their `rawg_` review isn't merged. It stays on the `rawg_` item and is reported as a conflict.
- Re-running is safe. Mapped items are gone, so the next dry run shows only what's left. Running again with the same flags changes nothing.
- If IGDB fails, the command prints the summary so far and exits non-zero. Items already mapped stay mapped.

## Monitoring

Monitoring is lean on purpose: kube-prometheus-stack used about 1 GB of RAM on a ~4 GB box.

- **Machine health** (CPU, memory, disk, disk I/O, network, load) comes from [Beszel](https://beszel.dev), installed on the host, outside k3s.
- **External API usage** (OMDb, IGDB, MyAnimeList, Open Library) is counted per UTC day in Postgres. Every HTTP attempt counts, including retries, from both the web app and the refresh CronJob. See it at `https://<APP_DOMAIN>/api/usage/` (staff only).
- **Quota alerts:** the app sends one Telegram message when OMDb reaches 80% and 100% of 1,000 requests per day. The other APIs have no quota. The quotas live in `UPSTREAM_API_QUOTAS` in `critic/settings/common.py`. Check them against your API accounts.
- **Prod integration tests:** a daily CronJob runs the integration test suite against the real APIs with prod's keys, and sends one Telegram message naming the failed tests (see below).
- **Box down:** Beszel's hub runs on the same machine, so it can't report the machine being down. Use an outside check (below).

### One-time removal of the old Prometheus/Grafana stack

Run once, in this order, on a cluster that still has the old stack:

```bash
kubectl delete servicemonitor --all -n criticapp
kubectl delete deploy,svc criticapp-pushgateway -n criticapp
helm uninstall kube-prometheus-stack -n monitoring
# Required: the deploy workflow (not Helm) created the Grafana ingress and the
# dashboard ConfigMap here, and helm uninstall leaves them behind.
kubectl delete namespace monitoring
# Optional: Helm also leaves the Prometheus operator CRDs behind.
kubectl get crd -o name | grep monitoring.coreos.com | xargs kubectl delete
```

Then delete the `GRAFANA_DOMAIN` and `PUSHGATEWAY_URL` GitHub Actions secrets and the Grafana DNS record.

### Telegram bot for alerts

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Send the bot a message, then get your chat ID from `https://api.telegram.org/bot<token>/getUpdates` (`message.chat.id`).
3. Add `ALERT_TELEGRAM_BOT_TOKEN` and `ALERT_TELEGRAM_CHAT_ID` to `criticapp-secrets`, then restart: `kubectl rollout restart deployment/criticapp-web -n criticapp`. The refresh and integration-test CronJobs pick the keys up on their next run.

When either key is empty, alerts are skipped and only logged.

### Beszel (machine monitoring)

Install the hub and the agent on the host with the official scripts, which set up systemd services. See the [hub](https://beszel.dev/guide/hub-installation) and [agent](https://beszel.dev/guide/agent-installation) installation guides. Note the version you install, and update with the built-in `update` command described there.

- Keep the hub (default port 8090) off the public internet. Reach it over Tailscale or an SSH tunnel (`ssh -L 8090:localhost:8090 <host>`), not through an ingress. The hub may listen on all interfaces by default. Check with `sudo ss -tlnp | grep 8090`, and if it shows `0.0.0.0` or `*`, do one of these:
  - Bind it to localhost (or your tailnet IP) by changing the `--http` address in its systemd unit (`sudo systemctl edit --full beszel-hub`) and restarting it.
  - Block the port in the firewall, e.g. `sudo ufw deny 8090`.
  Do the same for the agent port 45876 if the hub and agent are on the same box.
- In the hub, add the system using the key the hub shows. The agent listens on port 45876 by default.
- Under Settings > Notifications, add the same Telegram bot (Beszel supports Telegram URLs), then add alerts for the system:
  - CPU above 90% for 10 minutes
  - Memory above 90%
  - Disk above 85%
  - "Status" (optional): this only catches a dead agent, because the hub is on the same box.
- Beszel doesn't report connection counts.
- On k3s, Beszel sees host-level stats only, because per-container stats need Docker or Podman. For per-pod usage, use `kubectl top pods -n criticapp`.

### Daily prod integration tests

CronJob manifest: `k8s/integration-cronjob.yaml`. The deploy workflow applies it after a successful web rollout, pinned to the deployed commit's image tag, so it tests the image that is live. A plain `kubectl apply -f` of the file uses `:latest` instead. If any of `OMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` or `MAL_CLIENT_ID` is missing from `criticapp-secrets`, it alerts about the missing keys without running the tests. It runs `python manage.py run_integration_checks` daily at 06:30 UTC. That command runs `pytest -m integration` in the prod image with prod's API keys but under `critic.settings.test`, so it never touches the prod database. If any test fails, errors or the run times out, it sends one Telegram message listing the failed tests and exits non-zero. A passing run sends nothing. Failed runs aren't retried, so there's one alert per failure.

Run it now and read the result:

```bash
kubectl create job --from=cronjob/criticapp-integration-tests criticapp-integration-manual -n criticapp
kubectl logs -n criticapp job/criticapp-integration-manual -f
kubectl delete job criticapp-integration-manual -n criticapp
```

Notes:

- It makes about 20 real API calls a day. They aren't counted on `/api/usage/`, because counting needs the database and the tests run without it.
- If the job's pod can't start at all (bad image, k3s down), nothing reports it. UptimeRobot covers k3s and the box going down.
- The GitHub Actions integration run (03:00 UTC) stays. It runs even when the box is down, and separates "the APIs changed" from "prod is broken".

### Outside check for the box being down

Create a free [UptimeRobot](https://uptimerobot.com) HTTP monitor for `https://<APP_DOMAIN>/api/auth/session` (5-minute interval) with email or app notifications. It is public, returns 200 and goes through Django. `https://<APP_DOMAIN>/health/` now reaches the frontend, not Django, so don't use it.

## Troubleshooting

### Migration job failed

```bash
kubectl get jobs -n criticapp
kubectl logs -n criticapp job/criticapp-migrate
kubectl describe job criticapp-migrate -n criticapp
```

### Web rollout stuck

```bash
kubectl describe deployment criticapp-web -n criticapp
kubectl get pods -n criticapp -l app=criticapp-web
kubectl logs -n criticapp deploy/criticapp-web --tail=200
```

### Frontend rollout stuck

```bash
kubectl describe deployment criticapp-frontend -n criticapp
kubectl get pods -n criticapp -l app=criticapp-frontend
kubectl logs -n criticapp deploy/criticapp-frontend --tail=200
```

`ImagePullBackOff` usually means the `criticapp-frontend` GHCR package is private. Make it public and re-run the deploy.

### TLS certificate not ready

```bash
kubectl get certificate -n criticapp
kubectl describe certificate criticapp-web-tls -n criticapp
kubectl get clusterissuer
```

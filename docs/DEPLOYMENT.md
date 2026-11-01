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
- Beszel on the host for machine monitoring, and a staff-only API usage page with Telegram quota alerts (see [Monitoring](#monitoring))
- GitHub Actions workflow at `.github/workflows/deploy-k8s.yml`

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
- `RAWG_API_KEY`
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
```

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

1. Builds and pushes Docker image tags to GHCR
2. Uploads `k8s/` manifests to the target server over SSH
3. Applies core Kubernetes resources
4. Creates or updates `criticapp-config` ConfigMap from workflow values
5. Applies ingress resources and optional ClusterIssuer
6. Runs migration job with the new image
7. Rolls out `criticapp-web` with zero-downtime strategy

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

- `/health/` for readiness and liveness
- `/metrics/` Prometheus-format metrics (blocked at the ingress; nothing scrapes it since the move to Beszel)
- `/usage/` staff-only page with external API usage against quotas

Useful checks:

```bash
kubectl get deployment criticapp-web -n criticapp
kubectl rollout status deployment/criticapp-web -n criticapp --timeout=300s
kubectl logs -n criticapp deploy/criticapp-web --tail=200
```

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

## Monitoring

Monitoring is lean on purpose: kube-prometheus-stack used about 1 GB of RAM on a ~4 GB box.

- **Machine health** (CPU, memory, disk, disk I/O, network, load) comes from [Beszel](https://beszel.dev), installed on the host, outside k3s.
- **External API usage** (OMDb, RAWG, MyAnimeList, Open Library) is counted per UTC day in Postgres. Every HTTP attempt counts, including retries, from both the web app and the refresh CronJob. See it at `https://<APP_DOMAIN>/usage/` (staff only).
- **Quota alerts:** the app sends one Telegram message when OMDb reaches 80% and 100% of 1,000 requests per day, and when RAWG reaches 80% and 100% of 20,000 requests per month. The quotas live in `UPSTREAM_API_QUOTAS` in `critic/settings/common.py`. Check them against your API accounts.
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
3. Add `ALERT_TELEGRAM_BOT_TOKEN` and `ALERT_TELEGRAM_CHAT_ID` to `criticapp-secrets`, then restart: `kubectl rollout restart deployment/criticapp-web -n criticapp`. The refresh CronJob picks the keys up on its next run.

When either key is empty, quota alerts are skipped and only logged.

### Beszel (machine monitoring)

Install the hub and the agent on the host with the official scripts, which set up systemd services. See the [hub](https://beszel.dev/guide/hub-installation) and [agent](https://beszel.dev/guide/agent-installation) installation guides. Note the version you install, and update with the built-in `update` command described there.

- Keep the hub (default port 8090) off the public internet. Reach it over Tailscale or an SSH tunnel (`ssh -L 8090:localhost:8090 <host>`), not through an ingress.
- In the hub, add the system using the key the hub shows. The agent listens on port 45876 by default.
- Under Settings > Notifications, add the same Telegram bot (Beszel supports Telegram URLs), then add alerts for the system:
  - CPU above 90% for 10 minutes
  - Memory above 90%
  - Disk above 85%
  - "Status" (optional): this only catches a dead agent, because the hub is on the same box.
- Beszel doesn't report connection counts.
- On k3s, Beszel sees host-level stats only, because per-container stats need Docker or Podman. For per-pod usage, use `kubectl top pods -n criticapp`.

### Outside check for the box being down

Create a free [UptimeRobot](https://uptimerobot.com) HTTP monitor for `https://<APP_DOMAIN>/health/` (5-minute interval) with email or app notifications.

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

### TLS certificate not ready

```bash
kubectl get certificate -n criticapp
kubectl describe certificate criticapp-web-tls -n criticapp
kubectl get clusterissuer
```

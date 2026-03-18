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
- Prometheus scrape endpoints from the app and Pushgateway
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
- `GRAFANA_DOMAIN` (optional)
- `PUSHGATEWAY_URL` (optional)

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
kubectl apply -f k8s/pushgateway.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/servicemonitor.yaml
kubectl apply -f k8s/pushgateway-servicemonitor.yaml
kubectl apply -f k8s/middleware.yaml
```

Set host-specific values in the ConfigMap for production routing:

```bash
kubectl create configmap criticapp-config -n criticapp \
  --from-literal=DJANGO_SETTINGS_MODULE=critic.settings.production \
  --from-literal=ALLOWED_HOSTS="reviews.example.com,127.0.0.1,localhost,criticapp-web,criticapp-web.criticapp.svc.cluster.local" \
  --from-literal=CSRF_TRUSTED_ORIGINS="https://reviews.example.com" \
  --from-literal=PUSHGATEWAY_URL="http://criticapp-pushgateway.criticapp.svc.cluster.local:9091" \
  --from-literal=PUSHGATEWAY_JOB_NAME="critic_refresh_review_items" \
  --from-literal=PUSHGATEWAY_TIMEOUT_SECONDS="5" \
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

Optional Grafana ingress:

```bash
sed "s|__GRAFANA_DOMAIN__|grafana.example.com|g" k8s/grafana-ingress.yaml | kubectl apply -f -
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
5. Applies ingress resources and optional ClusterIssuer/Grafana ingress
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
- `/metrics/` for Prometheus scraping

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

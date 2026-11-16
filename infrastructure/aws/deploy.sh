#!/usr/bin/env bash
set -euo pipefail
# Executed by SSM as root. Never enable shell tracing here.
API_IMAGE=$1
WEB_IMAGE=$2
SECRET_ARN=$3
REGION=$4
[[ "$API_IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9/_-]+:sha-[a-f0-9]{40}$ ]]
[[ "$WEB_IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-z0-9/_-]+:sha-[a-f0-9]{40}$ ]]
[[ "$SECRET_ARN" =~ ^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$ ]]
[[ "$REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]]
cd /opt/servicegrid
umask 077
aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$REGION" --query SecretString --output text > .database-password
PASSWORD=$(cat .database-password)
[[ "$PASSWORD" =~ ^[A-Za-z0-9]{48}$ ]]
trap 'rm -f /opt/servicegrid/.database-password' EXIT
if [ -f .env ]; then cp .env .env.previous; fi
printf 'POSTGRES_PASSWORD=%s\nAPI_IMAGE=%s\nWEB_IMAGE=%s\n' "$PASSWORD" "$API_IMAGE" "$WEB_IMAGE" > .env
unset PASSWORD
REGISTRY=${API_IMAGE%%/*}
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
COMPOSE=/opt/servicegrid/source/infrastructure/aws/compose.staging.yaml
docker compose --env-file .env -f "$COMPOSE" pull
docker compose --env-file .env -f "$COMPOSE" up -d --wait --wait-timeout 180
curl --fail --silent http://127.0.0.1:8080/health/ready
printf '\nStaging health verified. Previous release coordinates are retained in .env.previous.\n'

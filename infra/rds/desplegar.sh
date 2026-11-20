#!/usr/bin/env bash
set -euo pipefail

stage=${1:-}
if [[ ! $stage =~ ^[a-z][a-z0-9-]*$ || $stage == dev ]]; then
  echo "Uso: bash infra/rds/desplegar.sh <stage-nuevo-distinto-de-dev>" >&2
  exit 2
fi

: "${RDS_SUBNET_IDS:?Subredes privadas, separadas por coma}"
: "${RDS_SECURITY_GROUP_ID:?Grupo de seguridad de MySQL}"
: "${RDS_SG_IDS:?Un grupo de seguridad para las Lambdas}"
: "${RDS_VPC_ID:?VPC del stage}"
: "${RDS_ROUTE_TABLE_IDS:?Tablas de rutas, separadas por coma}"
: "${RDS_INSTANCE_CLASS:?Clase de la instancia}"
: "${RDS_USER:?Usuario maestro de MySQL}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
region=us-east-1
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
services="$root/microservicios"

for tool in aws curl grep npm npx python3 tar tr zip; do
  command -v "$tool" >/dev/null || { echo "Falta $tool" >&2; exit 1; }
done

account="$(aws sts get-caller-identity --query Account --output text)"
export RDS_LAMBDA_ROLE_ARN="arn:aws:iam::$account:role/LabRole"

output() {
  aws cloudformation describe-stacks --region "$region" --stack-name "cs2032-rds-$stage" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}
existing="$(aws cloudformation list-stacks --region "$region" \
  --query "StackSummaries[?StackStatus!='DELETE_COMPLETE'].StackName" --output text)"
for entry in vacantes:listarVacantes entrevistas:crearEntrevista reportes:generarReporte; do
  service="${entry%:*}"
  function="${entry#*:}"
  stack="cs2032-$service-$stage"
  if ! grep -Fxq "$stack" <<< "$(tr '\t' '\n' <<< "$existing")"; then
    continue
  fi
  expected="$(output RdsHost)"
  current="$(aws lambda get-function-configuration --region "$region" \
    --function-name "$stack-$function" --query 'Environment.Variables.RDS_HOST' --output text)"
  if [[ -z "$expected" || "$expected" == None || "$current" != "$expected" ]]; then
    echo "$stack ya apunta a otra base. Elige un stage nuevo." >&2
    exit 1
  fi
done

mkdir "$temp/bootstrap"
curl --fail --silent --show-error --location --max-time 60 \
  "https://truststore.pki.rds.amazonaws.com/$region/$region-bundle.pem" \
  --output "$temp/bootstrap/rds-ca.pem"
python3 -m pip install --target "$temp/bootstrap" --only-binary=:all: \
  -r "$services/cs2032-final-vacantes/requirements.txt"
cp "$root/infra/rds/inicializar.py" "$services/cs2032-final-vacantes/sql/schema.sql" "$temp/bootstrap/"
(cd "$temp/bootstrap" && zip -qr "$temp/inicializar.zip" .)
export RDS_BOOTSTRAP_ZIP="$temp/inicializar.zip"

deploy() {
  (cd "$1" && npx --yes serverless@3.40.0 deploy --stage "$stage" --region "$region")
}
deploy "$root/infra/rds"

RDS_HOST="$(output RdsHost)"
RDS_PORT="$(output RdsPort)"
secret_arn="$(output RdsMasterSecretArn)"
for value in "$RDS_HOST" "$RDS_PORT" "$secret_arn"; do
  if [[ -z "$value" || "$value" == None ]]; then
    echo "El stack RDS no devolvió todas las salidas esperadas." >&2
    exit 1
  fi
done
export RDS_HOST RDS_PORT
RDS_USER="{{resolve:secretsmanager:$secret_arn:SecretString:username}}"
RDS_PASSWORD="{{resolve:secretsmanager:$secret_arn:SecretString:password}}"
export RDS_USER RDS_PASSWORD
export RDS_TLS=1

function_error="$(aws lambda invoke --region "$region" \
  --function-name "cs2032-rds-$stage-inicializar" \
  --query FunctionError --output text "$temp/result.json")"
if [[ "$function_error" != None ]] || ! python3 -c \
  'import json, sys; sys.exit(json.load(open(sys.argv[1])).get("ok") is not True)' "$temp/result.json"; then
  echo "Falló la inicialización de MySQL. Revisa los logs de cs2032-rds-$stage-inicializar." >&2
  exit 1
fi

for service in vacantes entrevistas reportes; do
  directory="$temp/$service"
  mkdir "$directory"
  (cd "$services/cs2032-final-$service" && tar --exclude=node_modules --exclude=.serverless -cf - .) \
    | tar -xf - -C "$directory"
  cp "$temp/bootstrap/rds-ca.pem" "$directory/common/"
  (cd "$directory" && npm ci)
  deploy "$directory"
done

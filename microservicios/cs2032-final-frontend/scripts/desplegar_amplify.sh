#!/usr/bin/env bash
# Despliega el frontend en AWS Amplify Hosting (despliegue manual por zip, sin GitHub).
# Uso (desde la raíz del repo, con credenciales del Learner Lab): bash scripts/desplegar_amplify.sh
set -euo pipefail

APP_NOMBRE=cs2032-crm-empleabilidad
RAMA=main
REGION=us-east-1

APP_ID=$(aws amplify list-apps --region $REGION \
  --query "apps[?name=='$APP_NOMBRE'].appId | [0]" --output text)
if [ "$APP_ID" = "None" ] || [ -z "$APP_ID" ]; then
  APP_ID=$(aws amplify create-app --region $REGION --name $APP_NOMBRE --platform WEB \
    --query app.appId --output text)
  aws amplify create-branch --region $REGION --app-id "$APP_ID" --branch-name $RAMA --stage PRODUCTION >/dev/null
  echo "App creada: $APP_ID"
fi

ZIP=$(mktemp -d)/frontend.zip
zip -qr "$ZIP" index.html docs.html app.js config.js styles.css docs/openapi

read -r JOB_ID URL_SUBIDA < <(aws amplify create-deployment --region $REGION --app-id "$APP_ID" \
  --branch-name $RAMA --query "[jobId, zipUploadUrl]" --output text)
curl -sf -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP" "$URL_SUBIDA"
aws amplify start-deployment --region $REGION --app-id "$APP_ID" --branch-name $RAMA --job-id "$JOB_ID" >/dev/null

echo -n "Desplegando job $JOB_ID"
while true; do
  ESTADO=$(aws amplify get-job --region $REGION --app-id "$APP_ID" --branch-name $RAMA \
    --job-id "$JOB_ID" --query job.summary.status --output text)
  case "$ESTADO" in
    SUCCEED) echo " listo"; break ;;
    FAILED|CANCELLED) echo " $ESTADO"; exit 1 ;;
    *) echo -n "."; sleep 3 ;;
  esac
done
echo "URL: https://$RAMA.$(aws amplify get-app --region $REGION --app-id "$APP_ID" --query app.defaultDomain --output text)"

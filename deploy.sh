#!/usr/bin/env bash
# Build and deploy KOTSU to Cloud Run. Everything runs on Google Cloud:
# Cloud Build builds the image, Artifact Registry stores it, Cloud Run serves it.
set -euo pipefail

PROJECT="${KOTSU_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${KOTSU_REGION:-asia-southeast1}"
SERVICE="${KOTSU_SERVICE:-kotsu}"
BUCKET="${KOTSU_BUCKET:?set KOTSU_BUCKET to the Cloud Storage bucket for the videos}"
REPO="kotsu"

gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker \
       --location="$REGION" --project="$PROJECT" --description="KOTSU container images"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:$(date +%Y%m%d-%H%M%S)"

echo "Building $IMAGE with Cloud Build..."
gcloud builds submit --tag "$IMAGE" --project="$PROJECT" --region="$REGION"

echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --allow-unauthenticated \
  --cpu=2 --memory=2Gi \
  --timeout=300 \
  --concurrency=20 \
  --min-instances=1 \
  --max-instances=10 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT},KOTSU_BUCKET=${BUCKET},KOTSU_LOCATION=global"

gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format='value(status.url)'

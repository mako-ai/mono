#!/bin/bash

# Exit on any error
set -e

source .env

# Override environment variables for production deployment
export BASE_URL="https://revops.realadvisor.com"
export CLIENT_URL="https://revops.realadvisor.com"  
export VITE_API_URL="https://revops.realadvisor.com/api"

# Run eslint before building - fail on errors, allow warnings
echo "Running ESLint checks..."
pnpm run lint

echo "ESLint checks passed. Proceeding with build..."

# Configure Docker authentication for Artifact Registry (only do this once)
# gcloud auth configure-docker $REGION-docker.pkg.dev

# Create repository (one-time setup) (only do this once)
# gcloud artifacts repositories create $REPO \
#   --repository-format=docker \
#   --location=$REGION

# Rebuild and redeploy (explicitly build for linux/amd64 platform)
echo "Building Docker image..."
if ! docker build --platform linux/amd64 -t $IMAGE_NAME:latest .; then
    echo "❌ Docker build failed!"
    exit 1
fi

echo "Tagging and pushing Docker image..."
docker tag $IMAGE_NAME:latest $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest

# Create env.yaml by converting .env format to YAML format
# Convert KEY=value to KEY: "value" (quoted) and filter out empty lines and comments
# First output the overridden variables, then the rest from .env (excluding the overridden ones)
{
  echo "BASE_URL: \"$BASE_URL\""
  echo "CLIENT_URL: \"$CLIENT_URL\""
  echo "VITE_API_URL: \"$VITE_API_URL\""
  awk -F= '/^[^#]/ && NF==2 && $1!="BASE_URL" && $1!="CLIENT_URL" && $1!="VITE_API_URL" {print $1": \""$2"\""}' .env
} > env.yaml

# Update Cloud Run service
gcloud run services update revops-fullstack \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest \
  --region $REGION \
  --env-vars-file env.yaml

# Disable default run.app URL to force traffic through custom domain only (only do this once  )
# gcloud beta run services update revops-fullstack \
#   --region $REGION \
#   --no-default-url

# Verify domain ownership (only do this once)
# gcloud domains verify revops.realadvisor.com

# Add domain mapping (only do this once)
# gcloud beta run domain-mappings create \
#     --service=revops-fullstack \
#     --domain=revops.realadvisor.com \
#     --region=$REGION

# Add IAP policy
# gcloud run services add-iam-policy-binding revops-fullstack \
#     --region=$REGION \
#     --member="domain:revops.realadvisor.com" \
#     --role="roles/run.invoker" \
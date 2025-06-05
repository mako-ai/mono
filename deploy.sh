source .env

# Configure Docker authentication for Artifact Registry (only do this once)
# gcloud auth configure-docker $REGION-docker.pkg.dev

# Create repository (one-time setup) (only do this once)
# gcloud artifacts repositories create $REPO \
#   --repository-format=docker \
#   --location=$REGION

# Rebuild and redeploy (explicitly build for linux/amd64 platform)
docker build --platform linux/amd64 -t $IMAGE_NAME:latest .
docker tag $IMAGE_NAME:latest $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest

# Create env.yaml by converting .env format to YAML format
# Convert KEY=value to KEY: "value" (quoted) and filter out empty lines and comments
awk -F= '/^[^#]/ && NF==2 {print $1": \""$2"\""}' .env > env.yaml

# Update Cloud Run service
gcloud run services update revops-fullstack \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:latest \
  --region $REGION \
  --env-vars-file env.yaml

# Verify domain ownership (only do this once)
# gcloud domains verify revops.realadvisor.com

# Add domain mapping (only do this once)
# gcloud beta run domain-mappings create \
#     --service=revops-fullstack \
#     --domain=revops.realadvisor.com \
#     --region=$REGION

# Add IAP policy
gcloud run services add-iam-policy-binding revops-fullstack \
    --region=$REGION \
    --member="allUsers" \
    --role="roles/run.invoker"
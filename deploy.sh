source .env

# Rebuild and redeploy
docker build -t $IMAGE_NAME:latest .
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
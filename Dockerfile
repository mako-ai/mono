# Just build everything in one go
FROM node:20 AS builder
WORKDIR /app

# Install pnpm first (this layer will be cached)
RUN npm install -g pnpm

# Copy everything
COPY . .

# Install all dependencies (workspace handles conflicts)
RUN pnpm install

# Build both apps
RUN pnpm run app:build
RUN pnpm run api:build

# Production stage
FROM node:20-slim
WORKDIR /app

# Install pnpm in production too (this layer will be cached)
RUN npm install -g pnpm

# Copy EVERYTHING we need for the API to run
COPY --from=builder /app/api/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install production dependencies
RUN pnpm install --prod

# Copy built files
COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/app/dist ./public

# Copy config directory
COPY --from=builder /app/config /config
COPY --from=builder /app/consoles /consoles

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["node"]
CMD ["dist/index.js"]
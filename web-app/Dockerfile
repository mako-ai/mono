# Multi-stage build for the web app
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Build frontend
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm run build

# Build backend
FROM base AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY backend/ .
RUN pnpm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy backend build and install production dependencies
COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy necessary files from root project
COPY ../src ./src
COPY ../config ./config

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"] 
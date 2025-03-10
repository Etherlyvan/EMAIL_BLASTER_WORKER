# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies with explicit TypeScript installation
RUN npm ci && \
    npm install -g typescript && \
    which tsc && \
    chmod +x $(which tsc)

# Copy source code
COPY . .

# Build TypeScript code using npx for explicit path resolution
RUN npx tsc

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
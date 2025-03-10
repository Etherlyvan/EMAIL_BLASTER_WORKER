# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with explicit TypeScript installation
RUN npm install && \
    npm install -g typescript && \
    chmod +x /usr/local/bin/tsc

# Copy source code
COPY . .

# Build using npx to ensure proper path resolution
RUN npx tsc

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
# Copy prisma directory if it exists
COPY --from=builder /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
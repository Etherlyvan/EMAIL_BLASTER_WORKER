# Use a specific Node.js version for better stability
FROM node:18.17.1-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies with a simplified, reliable approach
RUN npm install --no-fund --no-optional

# Copy application code
COPY . .

# Build TypeScript code with simplified options
RUN npm run railway:build

# Production stage with minimal dependencies
FROM node:18.17.1-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies with minimal options
RUN npm install --omit=dev --no-fund --no-optional

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]
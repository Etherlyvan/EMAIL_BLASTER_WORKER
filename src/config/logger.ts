import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { env } from './environment';

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), env.logging.directory);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? `\n${stack}` : ''}`;
  })
);

// Configure transports based on environment
const transports: winston.transport[] = [
  // Always log to console
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
  })
];

// Add file transports in production or if explicitly enabled
if (!env.isDevelopment || process.env.ENABLE_FILE_LOGGING === 'true') {
  transports.push(
    // Write to all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: env.logging.level,
  format: logFormat,
  transports,
  // Don't exit on error
  exitOnError: false
});

export default logger;
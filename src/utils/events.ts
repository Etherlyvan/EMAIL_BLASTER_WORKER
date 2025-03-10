import { EventEmitter } from 'events';

// Create event emitter for internal communication
const eventEmitter = new EventEmitter();

// Increase max listeners to avoid warnings
eventEmitter.setMaxListeners(20);

export default eventEmitter;
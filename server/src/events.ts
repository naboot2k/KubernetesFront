import type { Response } from 'express';
import type { StreamEvent } from './types.js';

const clients = new Set<Response>();

export function sendEvent(response: Response, event: StreamEvent) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function sendComment(response: Response, comment: string) {
  response.write(`: ${comment}\n\n`);
}

export function addEventClient(response: Response) {
  clients.add(response);
}

export function removeEventClient(response: Response) {
  clients.delete(response);
}

export function broadcast(event: StreamEvent) {
  for (const client of clients) {
    sendEvent(client, event);
  }
}

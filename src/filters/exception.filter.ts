import type http from "node:http";
import { ValidationError } from "../pipes/zod-validation.pipe.js";

export class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidJsonError extends Error {
  constructor() {
    super("Invalid JSON");
    this.name = "InvalidJsonError";
  }
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload Too Large");
    this.name = "PayloadTooLargeError";
  }
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function exceptionFilter(err: unknown, res: http.ServerResponse): void {
  if (res.headersSent) return;

  if (err instanceof NotFoundError) {
    sendJson(res, 404, { error: err.message });
    return;
  }

  if (err instanceof ValidationError) {
    sendJson(res, 400, err.errors);
    return;
  }

  if (err instanceof InvalidJsonError) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  if (err instanceof PayloadTooLargeError) {
    sendJson(res, 413, { error: err.message });
    return;
  }

  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  sendJson(res, 500, { error: "Internal Server Error" });
}

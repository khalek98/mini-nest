import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type http from "node:http";

import { Container } from "../src/container.js";
import {
  createApp,
  type LifecycleHooks,
  type Middleware,
  type Next,
  type RequestContext,
} from "../src/dispatcher.js";
import { authGuard } from "../src/guards/auth.guard.js";
import { loggingInterceptor } from "../src/interceptors/logging.interceptor.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get } from "../src/decorators/methods.js";
import { NotFoundError } from "../src/filters/exception.filter.js";

const order: string[] = [];

@Controller("order")
@Injectable()
class OrderController {
  @Get()
  handle() {
    order.push("handler");
    return { ok: true };
  }
}

const orderMiddleware: Middleware = async (_ctx, next) => {
  order.push("middleware");
  return next();
};

function stubsThatLogOrder(): LifecycleHooks {
  return {
    onGuard(ctx: RequestContext) {
      void ctx;
      order.push("guard");
      return true;
    },
    async onInterceptor(ctx: RequestContext, next: Next) {
      void ctx;
      order.push("interceptor:before");
      const result = await next();
      order.push("interceptor:after");
      return result;
    },
    onPipe(ctx: RequestContext) {
      void ctx;
      order.push("pipe");
    },
  };
}

test("порядок lifecycle: middleware → guard → interceptor → pipe → handler → interceptor", async () => {
  order.length = 0;

  const container = new Container();
  const server: http.Server = createApp(container, [OrderController], {
    hooks: stubsThatLogOrder(),
    middleware: [orderMiddleware],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/order`);
    const body = (await res.json()) as { ok: boolean };

    console.log(`res: ${res.status} ${JSON.stringify(body)}`);
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);

    console.log(`order: ${order}`);
    assert.deepEqual(order, [
      "middleware",
      "guard",
      "interceptor:before",
      "pipe",
      "handler",
      "interceptor:after",
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("middleware без next() зупиняє ланцюг (handler не викликається)", async () => {
  order.length = 0;

  const stopMiddleware: Middleware = async () => {
    order.push("middleware");
    // без next() — далі нічого
  };

  const container = new Container();
  const server: http.Server = createApp(container, [OrderController], {
    hooks: stubsThatLogOrder(),
    middleware: [stopMiddleware],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await fetch(`http://127.0.0.1:${port}/order`);
    console.log(`order: ${order}`);
    assert.deepEqual(order, ["middleware"]);
    assert.ok(!order.includes("handler"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

let handlerCalls = 0;

@Controller("secure")
@Injectable()
class SecureController {
  @Get()
  handle() {
    handlerCalls += 1;
    return { secret: 99 };
  }
}

test("AuthGuard без Authorization → 403, handler не викликається", async () => {
  handlerCalls = 0;

  const container = new Container();
  const server: http.Server = createApp(container, [SecureController], {
    guards: [authGuard],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/secure`);
    const body = (await res.json()) as { error: string };
    console.log(`${res.status} ${JSON.stringify(body)} ${handlerCalls}`);
    assert.equal(res.status, 403);
    assert.equal(body.error, "Forbidden");
    assert.equal(handlerCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("AuthGuard з Authorization → 200, handler викликається", async () => {
  handlerCalls = 0;

  const container = new Container();
  const server: http.Server = createApp(container, [SecureController], {
    guards: [authGuard],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/secure`, {
      headers: { Authorization: "Bearer test" },
    });
    const body = (await res.json()) as { secret: number };
    console.log(`${res.status} ${JSON.stringify(body)} ${handlerCalls}`);
    assert.equal(res.status, 200);
    assert.equal(body.secret, 99);
    assert.equal(handlerCalls, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("LoggingInterceptor логує METHOD, шлях і тривалість у ms", async () => {
  const logs: string[] = [];

  const container = new Container();
  const server: http.Server = createApp(container, [OrderController], {
    interceptors: [loggingInterceptor((line) => logs.push(line))],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/order`);
    assert.equal(res.status, 200);
    assert.equal(logs.length, 1);
    const line = logs[0]!;
    console.log(line);
    assert.match(line, /[0-9]+(\.[0-9]+)? ?ms/);
    assert.match(line, /GET/);
    assert.match(line, /\/order/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

@Controller("boom")
@Injectable()
class BoomController {
  @Get()
  handle() {
    throw new Error("boom");
  }
}

test("невідома Error('boom') → 500 без boom і без стеку", async () => {
  const container = new Container();
  const server: http.Server = createApp(container, [BoomController]);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    const text = await res.text();
    console.log(`${res.status} ${text}`);
    assert.equal(res.status, 500);
    assert.doesNotMatch(text, /boom|at .*\.ts:/);
    const body = JSON.parse(text) as { error: string };
    assert.equal(body.error, "Internal Server Error");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

@Controller("missing")
@Injectable()
class MissingController {
  @Get()
  handle() {
    throw new NotFoundError("User not found");
  }
}

test("NotFoundError → 404 з осмисленим повідомленням", async () => {
  const container = new Container();
  const server: http.Server = createApp(container, [MissingController]);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/missing`);
    const body = (await res.json()) as { error: string };
    console.log(`${res.status} ${JSON.stringify(body)}`);
    assert.equal(res.status, 404);
    assert.match(body.error, /User not found/i);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

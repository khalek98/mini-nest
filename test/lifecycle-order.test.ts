import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type http from "node:http";

import { Container } from "../src/container.js";
import {
  createApp,
  type LifecycleHooks,
  type Next,
  type RequestContext,
} from "../src/dispatcher.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get } from "../src/decorators/methods.js";

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

function stubsThatLogOrder(): LifecycleHooks {
  return {
    onMiddleware(ctx: RequestContext) {
      void ctx;
      order.push("middleware");
    },
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

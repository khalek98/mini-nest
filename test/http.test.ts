import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type http from "node:http";

import { Container } from "../src/container.js";
import { createApp } from "../src/dispatcher.js";
import { Controller } from "../src/decorators/controller.js";
import { Injectable } from "../src/decorators/injectable.js";
import { Get } from "../src/decorators/methods.js";
import { Param } from "../src/decorators/params.js";
import { HealthController } from "../src/controllers/health.controller.js";
import { UsersController } from "../src/controllers/users.controller.js";
import { UsersService } from "../src/services/users.service.js";

async function withServer(
  run: (baseUrl: string, container: Container) => Promise<void>,
  controllers: Function[] = [HealthController, UsersController],
) {
  const container = new Container();
  const server: http.Server = createApp(container, controllers);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`, container);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

test("GET /users/:id — prefix + @Param", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users/42`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.match(JSON.stringify(body), /42/);
  });
});

test("GET /users?limit=5 — @Query", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users?limit=5`);
    const body = (await res.json()) as { limit: string };
    assert.equal(res.status, 200);
    assert.equal(body.limit, "5");
  });
});

test("POST невалідний DTO -> 400 + email", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const body = (await res.json()) as {
      field: string;
      constraints: string[];
    }[];
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(body));
    assert.match(JSON.stringify(body), /email/);
    assert.ok(
      body.some((e) => e.field === "email" && Array.isArray(e.constraints)),
    );
  });
});

test("POST невалідний JSON -> 400", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not-json",
    });
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 400);
    assert.match(body.error, /Invalid JSON/i);
  });
});

test("POST валідний DTO -> 201 + instanceof CreateUserDto", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada", email: "ada@example.com" }),
    });
    const body = (await res.json()) as {
      isDto: boolean;
      dtoClass: string;
      name: string;
    };
    assert.equal(res.status, 201);
    assert.equal(body.isDto, true);
    assert.equal(body.dtoClass, "CreateUserDto");
    assert.equal(body.name, "Ada");
  });
});

test("UsersService — singleton з контейнера", async () => {
  await withServer(async (base, container) => {
    const service = container.resolve(UsersService);
    const ctrl = container.resolve(UsersController);
    assert.equal(ctrl.users, service);

    const res = await fetch(`${base}/users/1`);
    assert.equal(res.status, 200);
  });
});

test("невідомий шлях -> 404", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("шлях є, метод інший -> 405", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users/42`, { method: "POST" });
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 405);
    assert.match(body.error, /Method Not Allowed/i);
  });
});

@Controller("shadow")
@Injectable()
class ShadowController {
  @Get(":id")
  byId(@Param("id") id: string) {
    return { route: "param", id };
  }

  @Get("active")
  active() {
    return { route: "active" };
  }
}

test("статичний маршрут виграє над динамічним (/shadow/active)", async () => {
  await withServer(
    async (base) => {
      const active = await fetch(`${base}/shadow/active`);
      const activeBody = (await active.json()) as { route: string };
      assert.equal(active.status, 200);
      assert.equal(activeBody.route, "active");

      const byId = await fetch(`${base}/shadow/42`);
      const byIdBody = (await byId.json()) as { route: string; id: string };
      assert.equal(byId.status, 200);
      assert.equal(byIdBody.route, "param");
      assert.equal(byIdBody.id, "42");
    },
    [ShadowController],
  );
});

@Injectable()
class BaseController {
  @Get("inherited")
  inherited() {
    return { ok: true };
  }
}

@Controller("child2")
@Injectable()
class ChildController extends BaseController {}

test("успадкований маршрут з базового контролера (/child2/inherited)", async () => {
  await withServer(
    async (base) => {
      const res = await fetch(`${base}/child2/inherited`);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
    },
    [ChildController],
  );
});

test("POST завелике тіло -> 413", async () => {
  await withServer(async (base) => {
    const oversized = "x".repeat(1024 * 1024 + 1);
    const res = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    });
    const body = (await res.json()) as { error: string };
    assert.equal(res.status, 413);
    assert.match(body.error, /Payload Too Large/i);
  });
});

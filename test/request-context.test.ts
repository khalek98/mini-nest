import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type http from "node:http";

import { Container } from "../src/container.js";
import { createApp } from "../src/dispatcher.js";
import { UsersController } from "../src/controllers/users.controller.js";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const container = new Container();
  const server: http.Server = createApp(container, [UsersController]);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

test("клієнтський X-Request-Id додається до заголовку і в тілі", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users/42`, {
      headers: { "X-Request-Id": "abc" },
    });
    const body = (await res.json()) as { id: string; requestId: string };
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-request-id"), "abc");
    assert.equal(body.requestId, "abc");
    assert.match(JSON.stringify(body), /42/);
  });
});

test("без заголовка генерується requestId і той самий у відповіді", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/users/42`);
    const body = (await res.json()) as { requestId: string };
    const echoed = res.headers.get("x-request-id");
    assert.equal(res.status, 200);
    assert.ok(echoed);
    assert.match(echoed, /^[0-9a-f-]{36}$/i);
    assert.equal(body.requestId, echoed);
  });
});

test("10 паралельних запитів не змішують requestId", async () => {
  await withServer(async (base) => {
    const ids = Array.from({ length: 10 }, (_, i) => `req-${i}`);
    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`${base}/users/42`, {
          headers: { "X-Request-Id": id },
        });
        const body = (await res.json()) as { requestId: string };
        return {
          sent: id,
          header: res.headers.get("x-request-id"),
          body: body.requestId,
        };
      }),
    );

    for (const row of results) {
      assert.equal(row.header, row.sent);
      assert.equal(row.body, row.sent);
    }
  });
});

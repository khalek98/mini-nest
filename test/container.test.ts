import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";

import { Inject } from "../src/decorators/inject.js";
import { Injectable } from "../src/decorators/injectable.js";

import { Container } from "../src/container.js";

import { CONFIG } from "../src/tokens.js";

test("рекурсивно збирає A → B → C з design:paramtypes", () => {
  @Injectable()
  class C {
    value = 42;
  }
  @Injectable()
  class B {
    constructor(readonly c: C) {}
  }
  @Injectable()
  class A {
    constructor(readonly b: B) {}
  }
  const a = new Container().resolve(A);
  assert.equal(a.b.c.value, 42);
  assert.ok(a.b.c instanceof C);
});

test("клас без @Injectable() відхиляється", () => {
  class Rogue {}

  assert.throws(() => new Container().resolve(Rogue), {
    message: "Rogue не позначений @Injectable()",
  });
});

test("@Inject резолвить за токеном, не за типом", () => {
  @Injectable()
  class App {
    constructor(@Inject(CONFIG) readonly config: { url: string }) {}
  }
  const c = new Container();
  c.register(CONFIG, { url: "postgres://localhost/demo" });
  const app = c.resolve(App);
  assert.equal(app.config.url, "postgres://localhost/demo");
});

test("singleton повертає той самий екземпляр", () => {
  @Injectable()
  class X {}
  const c = new Container();
  assert.equal(c.resolve(X), c.resolve(X));
});

test("transient повертає різні екземпляри", () => {
  @Injectable({ scope: "transient" })
  class X {}
  const c = new Container();
  assert.notEqual(c.resolve(X), c.resolve(X));
});

test("цикл кидає помилку з ланцюгом, не RangeError", () => {
  @Injectable()
  class A {
    constructor(_b: unknown) {}
  }

  @Injectable()
  class B {
    constructor(_a: A) {}
  }

  Reflect.defineMetadata("design:paramtypes", [B], A);

  try {
    new Container().resolve(A);
    assert.fail("мав кинути помилку циклу");
  } catch (e) {
    assert.ok(!(e instanceof RangeError));
    assert.match((e as Error).message, /A -> B -> A/);
  }
});

test("два класи з однаковим ім'ям не дають фальшивий цикл", () => {
  @Injectable()
  class ConfigA {
    n = 1;
  }
  @Injectable()
  class ConfigB {
    n = 2;
  }
  Object.defineProperty(ConfigA, "name", { value: "Config" });
  Object.defineProperty(ConfigB, "name", { value: "Config" });

  @Injectable()
  class App {
    constructor(
      readonly a: ConfigA,
      readonly b: ConfigB,
    ) {}
  }

  const app = new Container().resolve(App);
  assert.equal(app.a.n, 1);
  assert.equal(app.b.n, 2);
});
test("два класи з однаковим ім'ям не дають фальшивий цикл", () => {
  @Injectable()
  class ConfigA {
    n = 1;
  }
  @Injectable()
  class ConfigB {
    n = 2;
  }
  Object.defineProperty(ConfigA, "name", { value: "Config" });
  Object.defineProperty(ConfigB, "name", { value: "Config" });

  @Injectable()
  class App {
    constructor(
      readonly a: ConfigA,
      readonly b: ConfigB,
    ) {}
  }

  const app = new Container().resolve(App);
  assert.equal(app.a.n, 1);
  assert.equal(app.b.n, 2);
});

test("підклас без @Injectable не бере мітку батька", () => {
  @Injectable()
  class Parent {}
  class Child extends Parent {}

  assert.throws(() => new Container().resolve(Child), {
    message: "Child не позначений @Injectable()",
  });
});

test("повторний register після resolve дає нове значення", () => {
  const c = new Container();
  c.register(CONFIG, { n: 1 });
  assert.equal((c.resolve(CONFIG) as { n: number }).n, 1);

  c.register(CONFIG, { n: 2 });
  assert.equal((c.resolve(CONFIG) as { n: number }).n, 2);
});

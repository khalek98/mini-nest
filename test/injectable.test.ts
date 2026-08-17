import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Injectable, INJECTABLE_KEY } from "../src/decorators/injectable.js";

test("@Injectable() ставить мітку на клас", () => {
  @Injectable()
  class UserService {}

  assert.equal(Reflect.getMetadata(INJECTABLE_KEY, UserService), true);
});

test("клас без декоратора мітки не має", () => {
  class Rogue {}

  assert.equal(Reflect.getMetadata(INJECTABLE_KEY, Rogue), undefined);
});

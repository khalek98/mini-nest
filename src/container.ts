import "reflect-metadata";
import { INJECT_KEY, type InjectionToken } from "./decorators/inject.js";
import { INJECTABLE_KEY, Scope, SCOPE_KEY } from "./decorators/injectable.js";

type Ctor<T = unknown> = new (...args: any[]) => T;

export class Container {
  private singletons = new Map<InjectionToken, unknown>();
  private providers = new Map<InjectionToken, unknown>();

  register(token: InjectionToken, value: unknown): this {
    this.providers.set(token, value);
    return this;
  }

  resolve<T>(target: Ctor<T> | InjectionToken, path: string[] = []): T {
    const name = typeof target === "function" ? target.name : String(target);

    if (this.singletons.has(target)) {
      return this.singletons.get(target) as T;
    }

    if (path.includes(name)) {
      throw new Error(`цикл залежностей: ${[...path, name].join(" -> ")}`);
    }

    if (typeof target !== "function") {
      if (!this.providers.has(target)) {
        throw new Error(`${name} не зареєстрований`);
      }
      const value = this.providers.get(target) as T;
      this.singletons.set(target, value);
      return value;
    }

    const ctor = target as Ctor<T>;

    if (!Reflect.getMetadata(INJECTABLE_KEY, ctor)) {
      throw new Error(`${ctor.name} не позначений @Injectable()`);
    }

    const paramtypes = (Reflect.getMetadata("design:paramtypes", ctor) ??
      []) as InjectionToken[];
    const injected = (Reflect.getOwnMetadata(INJECT_KEY, ctor) ??
      []) as InjectionToken[];
    const deps = paramtypes.map((type, i) => injected[i] ?? type);

    const args = deps.map((dep) => this.resolve(dep, [...path, name]));
    const instance = new ctor(...args);
    const scope = Reflect.getMetadata(SCOPE_KEY, ctor) as Scope;

    if (scope === "singleton") {
      this.singletons.set(ctor, instance);
    }
    return instance;
  }
}

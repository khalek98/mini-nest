# mini-nest — Part 2: HTTP routing + DTO validation

Власний IoC-контейнер, який робить те саме, що робить NestJS під капотом: читає метадані типів із конструктора й сам збирає граф залежностей. IoC з частини 1 + маршрути на декораторах + pipe для DTO поверх `node:http`.

## Запуск

```bash
npm ci
npm test
npm run build && npm start
```

## Docker

```bash
# HW AC: build test stage + run tests
docker compose build
docker compose run --rm api npm test

# optional: runtime image (npm start + HEALTHCHECK on /health)
docker compose up app
```

## Як це працює

`@Controller` / `@Get` / `@Post` пишуть маршрути в метадані; `collectRoutes` склеює prefix + path. `createApp` знаходить маршрут, збирає аргументи з `@Body` / `@Param` / `@Query`, для body ганяє `validationPipe` (`plainToInstance` → `validate`), викликає метод контролера. Контролер і сервіс створює контейнер з частини 1.

Щоб і DI, і pipe знали типи в рантаймі, TypeScript має їх записати. Це робить `emitDecoratorMetadata`: компілятор емітить `design:paramtypes` — масив конструкторів параметрів (залежності конструктора або клас DTO для `@Body`). Контейнер і dispatcher читають їх через `Reflect.getMetadata('design:paramtypes', ...)`. Без цього прапорця метаданих немає: `getMetadata` поверне `undefined`, DI не підставить сервіси, а валідація DTO «мовчки» не спрацює (сирий об'єкт пройде як валідний). Потрібні ще `import 'reflect-metadata'` і хоча б один декоратор на класі/методі — інакше компілятор не емітить `design:paramtypes`.

## Як параметр-декоратор знає, куди підставити значення

`@Body`, `@Param` і `@Query` **не** читають `req`. Вони лише пишуть у метадані методу мапу `{ [parameterIndex]: { type, name? } }`. Під час запиту dispatcher читає цю мапу, дістає значення з path / query / JSON body і збирає масив `args` для handler. Клас DTO для pipe береться з `design:paramtypes` того ж параметра.

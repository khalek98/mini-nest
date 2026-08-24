# mini-nest — Part 3: lifecycle запиту

Власний IoC-контейнер, який робить те саме, що робить NestJS під капотом: читає метадані типів із конструктора й сам збирає граф залежностей. IoC з частини 1 + маршрути на декораторах + Zod-pipe + повний цикл запиту поверх `node:http`.

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

## Порядок lifecycle

Кожен HTTP-запит проходить ті самі етапи. Exception filter — не «після відповіді», а `try/catch` навколо всього ланцюга: будь-який `throw` (guard, pipe, handler, interceptor) стає HTTP-відповіддю, а не падінням процесу.

```
request
  → middleware
  → guard
  → interceptor (before)
  → pipe
  → handler
  → interceptor (after)
  → response
  ↑ exception filter wraps the whole try/catch
```

- **AuthGuard** — до pipe і handler. Повертає лише `boolean`: немає `Authorization` → dispatcher шле `403`, handler не викликається.
- **LoggingInterceptor** — обгортає `next()`: код до handler, виклик, код після. Таймінг включає pipe і handler (все, що в середині `next()`). Лог: `METHOD /path — 12.3 ms`.
- **Zod pipe** — валідація `@Body` безпосередньо перед handler. DTO тримає `static schema` (Zod 4); `safeParse` кидає `ValidationError` зі списком полів (`error.issues`, не Zod 3 `error.errors`).
- **Exception Filter** — `NotFoundError` → 404, `ValidationError` → 400 зі списком полів, усе інше → 500 **без** стек-трейсу й без внутрішнього тексту на кшталт `boom`.

## Як це працює

`@Controller` / `@Get` / `@Post` пишуть маршрути в метадані; `collectRoutes` склеює prefix + path. `createApp` знаходить маршрут, збирає аргументи з `@Body` / `@Param` / `@Query`, для body ганяє `zodValidationPipe`, викликає метод контролера. Контролер і сервіс створює контейнер з частини 1.

Щоб і DI, і pipe знали типи в рантаймі, TypeScript має їх записати. Це робить `emitDecoratorMetadata`: компілятор емітить `design:paramtypes` — масив конструкторів параметрів (залежності конструктора або клас DTO для `@Body`). Контейнер і dispatcher читають їх через `Reflect.getMetadata('design:paramtypes', ...)`. Без цього прапорця метаданих немає: `getMetadata` поверне `undefined`, DI не підставить сервіси, а Zod-pipe не знайде `metatype.schema`. Потрібні ще `import 'reflect-metadata'` і хоча б один декоратор на класі/методі — інакше компілятор не емітить `design:paramtypes`.

## Як параметр-декоратор знає, куди підставити значення

`@Body`, `@Param` і `@Query` **не** читають `req`. Вони лише пишуть у метадані методу мапу `{ [parameterIndex]: { type, name? } }`. Під час запиту dispatcher читає цю мапу, дістає значення з path / query / JSON body і збирає масив `args` для handler. Клас DTO для pipe береться з `design:paramtypes` того ж параметра.

## Чому AsyncLocalStorage, а не глобальна змінна

`requestId` береться з заголовка `X-Request-Id` або генерується, кладеться в `AsyncLocalStorage` (`als.run`) і віддається клієнту в тому ж заголовку. Сервіс читає його через `getRequestId()` — без параметра в сигнатурі.

Глобальна змінна тут зламається так само, як на Лекції 2 з паралельними запитами: поки запит A стоїть на `await`, event loop запускає запит B і перезаписує глобал. Коли A прокидається, там уже чужий id. ALS прив’язує store до async-продовження конкретного запиту, тому 10 паралельних `GET` не крадуть id один в одного.

# mini-nest (Part 1: IoC Container)

Власний IoC-контейнер: читає типи конструктора з метаданих і збирає граф залежностей.

## Запуск

```bash
npm install
npm test
docker compose run --rm api npm test
```

## Як це працює

@Injectable() — звичайна функція: вона лише ставить мітку на клас через Reflect.defineMetadata. Щоб контейнер знав, що інжектити, TypeScript має записати типи параметрів конструктора в рантайм. Це робить прапорець emitDecoratorMetadata: компілятор емітить design:paramtypes — масив конструкторів залежностей. Контейнер читає його через Reflect.getMetadata('design:paramtypes', Target) і рекурсивно викликає resolve для кожного елемента.

Без emitDecoratorMetadata метаданих типів не буде: getMetadata поверне undefined, і контейнер створить клас без залежностей. Потрібні ще дві умови: поліфіл reflect-metadata (інакше немає Reflect.getMetadata) і хоча б один декоратор на класі (інакше компілятор не емітить design:paramtypes, навіть з увімкненим прапорцем). Інтерфейси в рантаймі стираються в Object, тому для них потрібен @Inject(token).

---
name: nestjs-arch
description: NestJS project architecture and conventions for this team — directory layout and file naming, interface-token dependency injection, when to use @Global(), env var handling without @nestjs/config, ValidationPipe for request shape, the store pattern, logging, thin controllers, consumer error handling, and constructor-injected unit tests. Use when creating or modifying NestJS modules, services, controllers, providers, or their tests.
---

## Directory Layout

One directory per feature, named after the feature (not after the layer):

```
src/
├── common/                      # cross-cutting helpers (retry, fetch wrappers, type guards)
├── redis/                       # infrastructure module
│   ├── redis.module.ts
│   ├── redis.constants.ts       # injection tokens
│   ├── idempotency.store.ts
│   └── job-state.type.ts
└── webhook/                     # feature module
    ├── webhook.module.ts
    ├── webhook.controller.ts
    ├── webhook.service.ts
    ├── dto/
    │   └── github-webhook-payload.ts
    └── guards/
        └── webhook-signature.guard.ts
```

File naming: `<name>.service.ts` / `.module.ts` / `.controller.ts` / `.store.ts` / `.constants.ts` /
`.interface.ts` / `.type.ts` / `.guard.ts` / `.spec.ts`, and `dto/<name>.payload.ts` for message payloads.

## Dependency Injection — Interface Tokens

Inject through a token + interface, not the concrete class. Declare the token next to the interface (or in
`*.constants.ts` for third-party clients):

```ts
// installation-token-manager.interface.ts
export const INSTALLATION_TOKEN_MANAGER = "INSTALLATION_TOKEN_MANAGER";

export interface InstallationTokenManager {
  getOctokit(installationId: number): Promise<Octokit>;
}
```

```ts
// consumer side
constructor(
  @Inject(INSTALLATION_TOKEN_MANAGER)
  private readonly tokenManager: InstallationTokenManager,
) {}
```

```ts
// module side
providers: [
  { provide: INSTALLATION_TOKEN_MANAGER, useClass: InstallationTokenManagerService },
],
exports: [INSTALLATION_TOKEN_MANAGER],
```

This keeps call sites unchanged when the implementation is swapped (mock, different caching strategy).
When an implementation doesn't exist yet, register a placeholder provider that throws, so wiring fails
loudly instead of silently injecting `undefined`:

```ts
{
  provide: REVIEW_ORCHESTRATOR,
  useFactory: () => {
    throw new Error('ReviewOrchestrator is not implemented. Provide a concrete class.');
  },
}
```

## When to Use `@Global()`

Only for infrastructure modules that nearly every feature needs — Redis, Kafka, GitHub App auth.
Feature modules are always imported explicitly, so the dependency graph stays readable.

## Environment Variables

Do **not** add `@nestjs/config`. Read `process.env` directly, and fail fast in the constructor when a
required value is missing:

```ts
constructor() {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID environment variable is not defined');
  }
}
```

Keep tunable constants (TTLs, timeouts, retry counts) as module-level `const`s, not env vars, unless they
genuinely differ per environment.

## Request Validation

Two different layers — don't conflate them:

- **Shape** (field presence, types, formats): `ValidationPipe` with `class-validator` decorators on the DTO.
  Enable it globally in `main.ts` and keep DTOs declarative.
  ```ts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  ```
- **Business rules** (does this repo exist, is this id real, is this state allowed): plain code in the
  service. Throw — no partial success, no silent skip.

## Store Pattern

Wrap external storage in a small `*.store.ts` class per concern. Encapsulate key construction in a private
method and keep the TTL at the top of the file:

```ts
const TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class IdempotencyStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async markProcessed(jobId: string): Promise<void> {
    await this.redis.set(this.key(jobId), "1", "EX", TTL_SECONDS);
  }

  private key(jobId: string): string {
    return `review:idempotency:${jobId}`;
  }
}
```

## Logging

One logger per class, named after the class. Messages in Korean; pass the error object as the second
argument rather than interpolating it:

```ts
private readonly logger = new Logger(WebhookService.name);

this.logger.error(`PR 데이터 수집 실패 (PR #${prNumber})`, err);
```

## Controllers Stay Thin

A controller maps the route and delegates. No business logic, no data shaping:

```ts
@Controller()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  handleWebhook(@Body() payload: GithubWebhookPayload): void {
    this.webhookService.handle(payload);
  }
}
```

Import DTO types with `import type` so they don't survive into the compiled output.

## Consumer Error Handling

Message consumers do not catch processing failures — let them throw so the offset isn't committed and the
message is retried on restart/rebalance. Log crashes, but never `process.exit()`.

## Unit Tests

Don't build a `TestingModule` for a plain service. Instantiate it directly with object-literal mocks — it's
faster to read and write:

```ts
describe("ReviewDispatcherService", () => {
  let idempotencyStore: { exists: jest.Mock; markProcessed: jest.Mock };
  let kafkaProducer: { send: jest.Mock };
  let service: ReviewDispatcherService;

  beforeEach(() => {
    idempotencyStore = { exists: jest.fn(), markProcessed: jest.fn() };
    kafkaProducer = { send: jest.fn() };
    service = new ReviewDispatcherService(
      idempotencyStore as unknown as IdempotencyStore,
      kafkaProducer as unknown as KafkaProducerService,
    );
  });
});
```

Cover the **branches that carry decisions** (duplicate detection, completed/failed routing, publish
failure) rather than every method. Mock external clients; never open a real Redis/Kafka/HTTP connection in
a unit test.

> Use `TestingModule` only when the thing under test is the wiring itself (module resolution, guards,
> interceptors), not the logic inside a service.

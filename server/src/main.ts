import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

/**
 * 진입점.
 *
 * `ValidationPipe`를 전역으로 걸어 요청 형태(필드 존재·타입)를 DTO 데코레이터로 검증한다.
 * `whitelist`는 DTO에 없는 속성을 제거하고, `transform`은 평범한 body를 DTO 클래스 인스턴스로
 * 바꿔준다. 비즈니스 규칙 검증은 파이프가 아니라 서비스에서 예외로 처리한다.
 *
 * CORS를 켜는 이유: 체크박스 UI가 이 서버와 다른 도메인(`startup-official`)에 있어서, 브라우저가
 * 기본적으로 cross-origin 요청을 막는다. `enableCors`는 응답에
 * `Access-Control-Allow-Origin` 헤더를 붙여 지정한 origin의 JS만 이 API를 호출하게 허용한다.
 *
 * 주의: CORS는 **브라우저에서만 강제되는 규칙**이라 curl 같은 직접 호출은 전혀 막지 못한다.
 * 진짜 인증은 없는 상태이고, 그게 의도된 결정이다 (`.claude/rules/server.md`).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 배포된 대시보드와 로컬 개발 서버를 동시에 허용해야 하므로 쉼표로 여러 개를 받는다.
  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });

  // 기본 포트를 3001로 둔다 — 3000은 대시보드(startup-official) 개발 서버가 쓴다.
  await app.listen(config.get<number>('PORT') ?? 3001);
}
await bootstrap();

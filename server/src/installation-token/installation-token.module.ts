import { Global, Module } from '@nestjs/common';
import { INSTALLATION_TOKEN_MANAGER } from './installation-token-manager.interface.js';
import { InstallationTokenManagerService } from './installation-token-manager.service.js';

/**
 * `@Global()`을 붙이면 이 모듈을 한 번만 등록해도(app.module.ts) 다른 모든 모듈이 별도
 * import 없이 `INSTALLATION_TOKEN_MANAGER`를 주입받을 수 있다 — 거의 모든 기능이 GitHub 인증을
 * 필요로 하므로, 매번 `imports: [InstallationTokenModule]`을 반복하지 않기 위한 선택.
 *
 * 구체 클래스가 아니라 인터페이스 토큰(`INSTALLATION_TOKEN_MANAGER`)으로 주입하는 이유: 실제
 * 구현을 나중에 테스트용 mock이나 다른 캐싱 전략으로 바꿔도, 이 토큰을 주입받는 코드는 전혀
 * 수정할 필요가 없다 (NestJS의 DI 컨테이너가 토큰→구현체 매핑만 바꿔주면 됨).
 */
@Global()
@Module({
  providers: [
    {
      provide: INSTALLATION_TOKEN_MANAGER,
      useClass: InstallationTokenManagerService,
    },
  ],
  exports: [INSTALLATION_TOKEN_MANAGER],
})
export class InstallationTokenModule {}

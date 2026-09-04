import { Global, Module } from '@nestjs/common';
import { INSTALLATION_TOKEN_MANAGER } from './installation-token-manager.interface.js';
import { InstallationTokenManagerService } from './installation-token-manager.service.js';

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

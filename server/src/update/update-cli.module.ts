import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstallationTokenModule } from '../installation-token/installation-token.module.js';
import { UpdateModule } from './update.module.js';

/** CLI 전용 루트 모듈. HTTP 서버가 쓰는 `AppModule`과 분리해, 서버에는 이 기능이 로드되지 않는다. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InstallationTokenModule,
    UpdateModule,
  ],
})
export class UpdateCliModule {}

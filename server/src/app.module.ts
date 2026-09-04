import { Module } from '@nestjs/common';
import { InstallationTokenModule } from './installation-token/installation-token.module.js';
import { ReposModule } from './repos/repos.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { PrModule } from './pr/pr.module.js';

@Module({
  imports: [InstallationTokenModule, ReposModule, CatalogModule, PrModule],
})
export class AppModule {}

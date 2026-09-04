export interface CreatePrRequest {
  owner: string;
  repo: string;
  installationId: number;
  baseBranch: string;
  itemIds: string[];
}

export interface CreatePrResponse {
  url: string;
}

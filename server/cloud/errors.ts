import type { CloudPlanApiError } from '../../src/contracts/cloudPlan';

export class CloudError extends Error {
  constructor(readonly detail: CloudPlanApiError) {
    super(detail.code);
    this.name = 'CloudError';
  }
}
export const notFound = () => new CloudError({ code: 'NOT_FOUND', status: 404 });

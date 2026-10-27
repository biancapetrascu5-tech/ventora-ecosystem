export interface EntitlementProvider {
  isEnabled(organizationId: string, applicationId: string): Promise<boolean>;
}

export const allAppsEnabledProvider: EntitlementProvider = {
  isEnabled: async (_organizationId: string, _applicationId: string) => true,
};

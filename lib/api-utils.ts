/**
 * Utility to get the correct API base path for different environments
 */
export function getApiBasePath(): string {
  // Check if we're in production and using GitHub Pages
  const isGithubPages = process.env.NODE_ENV === 'production' && typeof window !== 'undefined';

  if (isGithubPages) {
    // For GitHub Pages, we need to include the base path
    return '/cb-testclient';
  }

  // For development and other environments
  return '';
}

/**
 * Creates a full API URL with the correct base path
 */
export function createApiUrl(endpoint: string): string {
  const basePath = getApiBasePath();
  // Ensure endpoint starts with /api
  const cleanEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  return `${basePath}${cleanEndpoint}`;
}

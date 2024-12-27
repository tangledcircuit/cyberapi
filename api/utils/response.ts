// Standard response type for consistency
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Helper to create consistent API responses
export function createResponse<T>(data?: T, error?: string): ApiResponse<T> {
  return {
    success: !error,
    ...(data && { data }),
    ...(error && { error }),
    timestamp: new Date().toISOString(),
  };
} 
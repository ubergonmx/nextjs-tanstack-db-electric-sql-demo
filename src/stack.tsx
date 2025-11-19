import "server-only";

import { StackServerApp } from "@stackframe/stack";

// Get the base URL from environment variable or construct it
function getBaseUrl() {
  // In production, use NEXT_PUBLIC_APP_URL if set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // In development, use localhost
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  
  // Fallback: try to construct from Vercel environment variables
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Last resort: return undefined to let Stack Auth handle it
  return undefined;
}

const baseUrl = getBaseUrl();

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  ...(baseUrl && {
    urls: {
      handler: `${baseUrl}/handler/[...stack]`,
      signIn: `${baseUrl}/handler/[...stack]`,
      signUp: `${baseUrl}/handler/[...stack]`,
      afterSignIn: baseUrl,
      afterSignUp: baseUrl,
    },
  }),
});

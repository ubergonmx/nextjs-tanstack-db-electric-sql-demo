import "server-only";

import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  // Use relative URLs - Stack Auth should auto-detect base URL from Next.js headers()
  // Make sure your domain is added to "Trusted domains" in Stack Auth dashboard
  urls: {
    handler: "/handler/[...stack]",
    signIn: "/handler/[...stack]",
    signUp: "/handler/[...stack]",
    afterSignIn: "/",
    afterSignUp: "/",
  },
});

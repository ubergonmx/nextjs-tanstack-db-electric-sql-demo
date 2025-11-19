import "server-only";

import { StackServerApp } from "@stackframe/stack";

export const stackServerApp = new StackServerApp({
  tokenStore: "nextjs-cookie",
  urls: {
    // Use relative URLs - Stack Auth will construct absolute URLs from request context
    handler: "/handler/[...stack]",
    signIn: "/handler/[...stack]",
    signUp: "/handler/[...stack]",
    afterSignIn: "/",
    afterSignUp: "/",
  },
});

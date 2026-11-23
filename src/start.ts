import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { BASIC_AUTH_CHALLENGE, isAuthorized } from "./lib/basic-auth";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Optional password gate: set QUORUM_BASIC_AUTH="username:password" to require HTTP Basic Auth
// for every page and server function. Unset (the default) leaves the app open.
const basicAuthMiddleware = createMiddleware().server(async ({ request, next }) => {
  const credentials = process.env["QUORUM_BASIC_AUTH"]?.trim();
  if (!credentials) return next();
  if (await isAuthorized(request.headers.get("authorization"), credentials)) return next();
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": BASIC_AUTH_CHALLENGE,
    },
  });
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// requestMiddleware runs on every request; functionMiddleware only on server functions, where
// client sendContext is unvalidated input. Append to these arrays, never replace them.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, basicAuthMiddleware, csrfMiddleware],
}));

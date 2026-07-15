import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  if (/^\/(?:en|fr)\/app(?:\/|$)/.test(context.url.pathname)) {
    return context.rewrite('/app');
  }

  return next();
});

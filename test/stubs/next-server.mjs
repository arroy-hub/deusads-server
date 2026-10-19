// Stand-in for next/server in the route tests: the real `after` needs a running Next.js request.
// By default it behaves as it does outside a request: it throws, and lib/after-response.js then does the work at once.
// A test can set globalThis.__afterTasks = [] to collect the work instead, as a real request does, and run it later.
export function after(task) {
  if (globalThis.__afterTasks) {
    globalThis.__afterTasks.push(task);
    return;
  }
  throw new Error("`after` was called outside a request scope.");
}

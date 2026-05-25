"use strict";

const ROUTES = Object.freeze([
  {
    name: "telemetry",
    methods: ["POST"],
    match: (path) => path === "/telemetry",
    targetKey: "ingestion"
  },
  {
    name: "dso-grid-signal",
    methods: ["POST"],
    match: (path) => path === "/dso/grid-signal",
    targetKey: "ieee20305"
  },
  {
    name: "dispatch-proposals",
    methods: ["GET"],
    match: (path) => path === "/dispatch/proposals" || path.startsWith("/dispatch/proposals/"),
    targetKey: "aggregator"
  },
  {
    name: "approvals",
    methods: ["GET", "POST"],
    match: (path) => path === "/approvals" || path.startsWith("/approvals/"),
    targetKey: "approval"
  },
  {
    name: "mock-dispatch",
    methods: ["GET"],
    match: (path) => path === "/mock-dispatch" || path.startsWith("/mock-dispatch/"),
    targetKey: "mockDispatch"
  },
  {
    name: "dataspace",
    methods: ["GET", "POST"],
    match: (path) => path === "/dataspace" || path.startsWith("/dataspace/"),
    targetKey: "dataspace"
  },
  {
    name: "device-command",
    methods: ["GET"],
    match: (path) => path === "/device-command" || path.startsWith("/device-command/"),
    targetKey: "deviceCommand"
  }
]);

function findRoute(path) {
  return ROUTES.find((route) => route.match(path)) || null;
}

function resolveRoute(method, path) {
  const route = findRoute(path);
  if (!route) {
    return null;
  }

  return route.methods.includes(method)
    ? { ...route, allowed: true }
    : { ...route, allowed: false };
}

function buildTargetUrl(route, request, config) {
  const baseUrl = config.targets[route.targetKey];
  return `${baseUrl}${request.originalUrl}`;
}

function buildForwardHeaders(request, config, route) {
  const headers = {
    "content-type": request.get("content-type") || "application/json",
    "x-correlation-id": request.correlationId,
    "x-forwarded-for": request.clientIp,
    "user-agent": request.get("user-agent") || "adflex-security-gateway"
  };

  const authorization = request.get("authorization");
  if (authorization) {
    headers.authorization = authorization;
  }

  if (route.targetKey === "dataspace" && config.dataspacesInternalApiKey) {
    headers["x-api-key"] = config.dataspacesInternalApiKey;
  }

  return headers;
}

async function proxyRequest({ request, response, route, config, proxyFetch = fetch }) {
  const targetUrl = buildTargetUrl(route, request, config);
  const options = {
    method: request.method,
    headers: buildForwardHeaders(request, config, route)
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    options.body = request.rawBody || JSON.stringify(request.body || {});
  }

  const downstream = await proxyFetch(targetUrl, options);
  const bodyText = await downstream.text();
  const contentType = downstream.headers.get("content-type") || "application/json";

  response
    .status(downstream.status)
    .set("content-type", contentType)
    .send(bodyText);

  return {
    statusCode: downstream.status,
    targetUrl,
    targetService: route.name
  };
}

module.exports = {
  ROUTES,
  buildForwardHeaders,
  buildTargetUrl,
  findRoute,
  proxyRequest,
  resolveRoute
};

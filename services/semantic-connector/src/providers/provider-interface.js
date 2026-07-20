"use strict";

class InferenceProvider {
  constructor({ name, model, endpoint, serverIdentity = null }) {
    if (!name || !model || !endpoint) {
      throw new Error("Inference provider requires name, model, and endpoint.");
    }
    this.name = name;
    this.model = model;
    this.endpoint = endpoint.replace(/\/$/, "");
    this.serverIdentity = serverIdentity || this.endpoint;
  }

  async healthCheck() {
    throw new Error("healthCheck() must be implemented by an inference provider.");
  }

  async warmUp() {
    return this.healthCheck();
  }

  async inferBatch(_readings, _options = {}) {
    throw new Error("inferBatch() must be implemented by an inference provider.");
  }
}

class ConcurrencyLimiter {
  constructor(maxConcurrency = 1) {
    this.maxConcurrency = Math.max(1, Number(maxConcurrency) || 1);
    this.active = 0;
    this.waiters = [];
  }

  async run(operation) {
    if (this.active >= this.maxConcurrency) {
      await new Promise((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}

class CircuitBreaker {
  constructor({ failureThreshold = 5, cooldownMs = 30000 } = {}) {
    this.failureThreshold = Math.max(1, Number(failureThreshold) || 5);
    this.cooldownMs = Math.max(100, Number(cooldownMs) || 30000);
    this.failures = 0;
    this.openedAt = null;
  }

  assertAvailable(now = Date.now()) {
    if (this.openedAt === null) return;
    if (now - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.failures = 0;
      return;
    }
    const error = new Error("slm_circuit_open");
    error.code = "slm_circuit_open";
    throw error;
  }

  async waitUntilAvailable() {
    if (this.openedAt === null) return;
    const remainingMs = this.cooldownMs - (Date.now() - this.openedAt);
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
    this.openedAt = null;
    this.failures = 0;
  }

  success() {
    this.failures = 0;
    this.openedAt = null;
  }

  failure(now = Date.now()) {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = now;
  }

  state() {
    return this.openedAt === null ? "closed" : "open";
  }
}

module.exports = {
  CircuitBreaker,
  ConcurrencyLimiter,
  InferenceProvider
};

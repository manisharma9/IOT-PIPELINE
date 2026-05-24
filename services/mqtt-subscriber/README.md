# MQTT Subscriber

This Phase 1 service subscribes to `telemetry/#` on the MQTT broker and republishes valid telemetry JSON to the Kafka topic `raw.telemetry`.

It is intentionally small:

- MQTT broker receives telemetry from household or community gateways.
- This subscriber reads MQTT messages.
- It validates the message shape using the shared telemetry validator.
- Valid messages are published to Kafka for the engine service.
- Invalid MQTT messages are logged and skipped.

The deeper command path back to households is not implemented in Phase 1.

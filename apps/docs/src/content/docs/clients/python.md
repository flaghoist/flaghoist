---
title: Python
description: Read Flaghoist flags from Python with the OpenFeature Python SDK and its OFREP provider.
---

Verified against provider `0.3.0` and SDK `0.10.0`.

## Install

```bash
pip install openfeature-provider-ofrep
```

## Read a flag

```python
from openfeature import api
from openfeature.contrib.provider.ofrep import OFREPProvider
from openfeature.evaluation_context import EvaluationContext

api.set_provider(
    OFREPProvider(
        "https://team-flags.you.workers.dev",
        headers_factory=lambda: {"x-api-key": "your-read-api-key"},
    )
)

client = api.get_client()
ctx = EvaluationContext(targeting_key="user-123", attributes={"plan": "pro"})

if client.get_boolean_value("new-checkout", False, ctx):
    ...  # serve the new checkout
```

`headers_factory` is called per request, so the `x-api-key` header is attached to every evaluation.
A wrong key returns the default you passed rather than the real value.

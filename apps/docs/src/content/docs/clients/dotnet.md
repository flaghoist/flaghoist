---
title: .NET
description: Read Flaghoist flags from .NET with the OpenFeature .NET SDK and its OFREP provider.
---

Verified against provider `0.1.5` on the .NET `10.0` SDK.

## Install

```bash
dotnet add package OpenFeature.Providers.Ofrep
```

## Read a flag

```csharp
using OpenFeature;
using OpenFeature.Model;
using OpenFeature.Providers.Ofrep;
using OpenFeature.Providers.Ofrep.Configuration;

var options = new OfrepOptions("https://team-flags.you.workers.dev")
{
    Headers = new Dictionary<string, string> { ["x-api-key"] = "your-read-api-key" },
};

await Api.Instance.SetProviderAsync(new OfrepProvider(options));

var client = Api.Instance.GetClient();
var ctx = EvaluationContext.Builder()
    .SetTargetingKey("user-123")
    .Set("plan", "pro")
    .Build();

bool enabled = await client.GetBooleanValueAsync("new-checkout", false, ctx);
```

The `Headers` dictionary attaches `x-api-key` to every request. A wrong key returns the default you
passed rather than the real value.

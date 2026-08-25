---
title: Java
description: Read Flaghoist flags from Java with the OpenFeature Java SDK and its OFREP provider.
---

Verified against provider `0.0.2` and SDK `1.17.0`.

## Install

```xml
<dependency>
  <groupId>dev.openfeature.contrib.providers</groupId>
  <artifactId>ofrep</artifactId>
  <version>0.0.2</version>
</dependency>
<dependency>
  <groupId>dev.openfeature</groupId>
  <artifactId>sdk</artifactId>
  <version>1.17.0</version>
</dependency>
```

## Read a flag

```java
import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import dev.openfeature.contrib.providers.ofrep.OfrepProvider;
import dev.openfeature.contrib.providers.ofrep.OfrepProviderOptions;
import dev.openfeature.sdk.Client;
import dev.openfeature.sdk.EvaluationContext;
import dev.openfeature.sdk.MutableContext;
import dev.openfeature.sdk.OpenFeatureAPI;

OfrepProviderOptions options = OfrepProviderOptions.builder()
    .baseUrl("https://team-flags.you.workers.dev")
    .headers(ImmutableMap.of("x-api-key", ImmutableList.of("your-read-api-key")))
    .build();

OpenFeatureAPI.getInstance().setProviderAndWait(OfrepProvider.constructProvider(options));

Client client = OpenFeatureAPI.getInstance().getClient();
EvaluationContext ctx = new MutableContext("user-123").add("plan", "pro");

boolean enabled = client.getBooleanValue("new-checkout", false, ctx);
```

Two things worth knowing. Reach the options builder through `OfrepProviderOptions.builder()`; the
builder's constructor is package private, so `new OfrepProviderOptions.Builder()` will not compile.
And `headers` takes a Guava `ImmutableMap<String, ImmutableList<String>>`, one list of values per
header name. A wrong key returns the default you passed.

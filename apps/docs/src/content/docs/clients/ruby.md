---
title: Ruby
description: Read Flaghoist flags from Ruby with the OpenFeature Ruby SDK and its OFREP provider.
---

Verified against provider `0.1.2` and SDK `0.3.1`. Needs Ruby 3.1 or newer.

## Install

```bash
gem install openfeature-ofrep-provider
```

Or in a `Gemfile`:

```ruby
gem "openfeature-ofrep-provider"
```

## Read a flag

```ruby
require "open_feature/sdk"
require "openfeature/ofrep/provider"

config = OpenFeature::OFREP::Configuration.new(
  base_url: "https://team-flags.you.workers.dev",
  headers: { "x-api-key" => "your-read-api-key" },
)

OpenFeature::SDK.configure do |c|
  c.set_provider(OpenFeature::OFREP::Provider.new(configuration: config))
end

client = OpenFeature::SDK.build_client
ctx = OpenFeature::SDK::EvaluationContext.new(targeting_key: "user-123", "plan" => "pro")

enabled = client.fetch_boolean_value(
  flag_key: "new-checkout",
  default_value: false,
  evaluation_context: ctx,
)
```

The `Configuration` class sits directly under `OpenFeature::OFREP`, not under `Provider`, so it is
`OpenFeature::OFREP::Configuration`. A wrong key returns the default you passed.

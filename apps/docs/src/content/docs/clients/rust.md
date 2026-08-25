---
title: Rust
description: Read Flaghoist flags from Rust with the OpenFeature Rust SDK and its OFREP provider.
---

Verified against provider `0.1.2` and SDK `0.3.0`.

## Install

```toml
[dependencies]
open-feature = "0.3"
open-feature-ofrep = "0.1"
reqwest = "0.13"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

The OFREP provider needs `open-feature` 0.3 and `reqwest` 0.13. Pinning older majors of either will
fail to compile against the provider's trait signatures.

## Read a flag

```rust
use open_feature::provider::FeatureProvider;
use open_feature::EvaluationContext;
use open_feature_ofrep::{OfrepOptions, OfrepProvider};
use reqwest::header::{HeaderMap, HeaderValue};

#[tokio::main]
async fn main() {
    let mut headers = HeaderMap::new();
    headers.insert("x-api-key", HeaderValue::from_static("your-read-api-key"));

    let provider = OfrepProvider::new(OfrepOptions {
        base_url: "https://team-flags.you.workers.dev".to_string(),
        headers,
        ..Default::default()
    })
    .await
    .unwrap();

    let ctx = EvaluationContext::default()
        .with_targeting_key("user-123")
        .with_custom_field("plan", "pro");

    let result = provider
        .resolve_bool_value("new-checkout", &ctx)
        .await
        .unwrap();

    if result.value {
        // serve the new checkout
    }
}
```

A wrong key resolves to an error, which the OpenFeature client turns into the default you passed.

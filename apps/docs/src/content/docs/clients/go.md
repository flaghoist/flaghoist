---
title: Go
description: Read Flaghoist flags from Go with the OpenFeature Go SDK and its OFREP provider.
---

Verified against provider `v0.1.7` and `go-sdk` `v1.18.0`.

## Install

```bash
go get github.com/open-feature/go-sdk-contrib/providers/ofrep
go get github.com/open-feature/go-sdk/openfeature
```

The import path is the module root, `.../providers/ofrep`, not a `/pkg` subpackage.

## Read a flag

```go
package main

import (
	"context"

	"github.com/open-feature/go-sdk-contrib/providers/ofrep"
	"github.com/open-feature/go-sdk/openfeature"
)

func main() {
	provider := ofrep.NewProvider(
		"https://team-flags.you.workers.dev",
		ofrep.WithApiKeyAuth("your-read-api-key"),
	)
	if err := openfeature.SetProviderAndWait(provider); err != nil {
		panic(err)
	}

	client := openfeature.NewClient("my-app")
	evalCtx := openfeature.NewEvaluationContext("user-123", map[string]interface{}{
		"plan": "pro",
	})

	enabled, _ := client.BooleanValue(context.Background(), "new-checkout", false, evalCtx)
	if enabled {
		// serve the new checkout
	}
}
```

`WithApiKeyAuth` attaches the `x-api-key` header. If the key is wrong, `BooleanValue` returns the
default you passed (`false` here), never the real flag value.

package content

import (
	"context"
	"fmt"
	"strconv"
)

// ParseContentVersion parses the query parameter "content_version".
//
// Semantics:
// - empty string means "unspecified" -> (nil, nil)
// - positive integer means explicit version -> (&n, nil)
// - everything else returns error
func ParseContentVersion(s string) (*int, error) {
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return nil, fmt.Errorf("invalid content_version")
	}
	return &n, nil
}

// ResolveContentVersion determines the effective content version for the request.
//
// v0.1 behavior:
// - if explicit is set, return it
// - otherwise default to 1 (future: releases/runtime_config)
func ResolveContentVersion(ctx context.Context, userID string, explicit *int) (int, error) {
	_ = ctx
	_ = userID

	if explicit != nil {
		return *explicit, nil
	}
	return 1, nil
}

//go:build !go1.21
// +build !go1.21

package storage

import (
	"context"
	"fmt"
	"time"
)

// MinIO is a stub implementation for Go toolchains < 1.21.
//
// The real implementation depends on github.com/minio/minio-go/v7, which
// (in our current version) requires Go >= 1.21. For local/dev environments
// where the Go toolchain is older, we keep the API compile-able and let
// callers gracefully fallback to other storage modes.
type MinIO struct{}

func NewMinIOFromEnv() (*MinIO, error) {
	return nil, fmt.Errorf("minio disabled: requires go1.21+ toolchain")
}

func (m *MinIO) EnsureBucket(ctx context.Context) error {
	return fmt.Errorf("minio disabled: requires go1.21+ toolchain")
}

func (m *MinIO) PresignPut(ctx context.Context, objectKey string, expires time.Duration, contentType string) (string, map[string]string, error) {
	return "", nil, fmt.Errorf("minio disabled: requires go1.21+ toolchain")
}

func (m *MinIO) PresignGet(ctx context.Context, objectKey string, expires time.Duration) (string, error) {
	return "", fmt.Errorf("minio disabled: requires go1.21+ toolchain")
}

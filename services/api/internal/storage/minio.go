//go:build go1.21
// +build go1.21

package storage

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIO struct {
	Client *minio.Client
	Bucket string
}

func NewMinIOFromEnv() (*MinIO, error) {
	endpoint := os.Getenv("MIAODONG_MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	access := os.Getenv("MIAODONG_MINIO_ACCESS_KEY")
	if access == "" {
		access = "minio"
	}
	secret := os.Getenv("MIAODONG_MINIO_SECRET_KEY")
	if secret == "" {
		secret = "minio123456"
	}
	bucket := os.Getenv("MIAODONG_MINIO_BUCKET")
	if bucket == "" {
		bucket = "miaodong-audio"
	}

	useSSL := false
	if v := os.Getenv("MIAODONG_MINIO_USE_SSL"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("invalid MIAODONG_MINIO_USE_SSL: %w", err)
		}
		useSSL = b
	}

	c, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(access, secret, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}
	return &MinIO{Client: c, Bucket: bucket}, nil
}

func (m *MinIO) EnsureBucket(ctx context.Context) error {
	ok, err := m.Client.BucketExists(ctx, m.Bucket)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return m.Client.MakeBucket(ctx, m.Bucket, minio.MakeBucketOptions{})
}

func (m *MinIO) PresignPut(ctx context.Context, objectKey string, expires time.Duration, contentType string) (string, map[string]string, error) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	u, err := m.Client.PresignedPutObject(ctx, m.Bucket, objectKey, expires)
	if err != nil {
		return "", nil, err
	}
	return u.String(), map[string]string{"Content-Type": contentType}, nil
}

func (m *MinIO) PresignGet(ctx context.Context, objectKey string, expires time.Duration) (string, error) {
	u, err := m.Client.PresignedGetObject(ctx, m.Bucket, objectKey, expires, nil)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

package inference

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type HTTPError struct {
	StatusCode int
	Body       string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("inference status %d: %s", e.StatusCode, e.Body)
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

type InferReq struct {
	AudioURL string         `json:"audio_url"`
	Context  map[string]any `json:"context,omitempty"`
}

func NewWithTimeout(baseURL string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: timeout},
	}
}

func New(baseURL string) *Client {
	return NewWithTimeout(baseURL, 3*time.Second)
}

func (c *Client) Infer(ctx context.Context, req InferReq) (map[string]any, error) {
	if c.BaseURL == "" {
		return nil, fmt.Errorf("inference base url empty")
	}
	b, _ := json.Marshal(req)
	r, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/infer", bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(r)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &HTTPError{StatusCode: resp.StatusCode, Body: string(body)}
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

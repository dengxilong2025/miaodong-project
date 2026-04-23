package inference

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

type InferReq struct {
	AudioURL string         `json:"audio_url"`
	Context  map[string]any `json:"context,omitempty"`
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTP:   &http.Client{Timeout: 3 * time.Second},
	}
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
		return nil, fmt.Errorf("inference status %d", resp.StatusCode)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}


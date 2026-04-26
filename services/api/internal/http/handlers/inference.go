package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/inference"
)

func inferenceTimeout() time.Duration {
	v := os.Getenv("MIAODONG_INFERENCE_TIMEOUT_MS")
	if v == "" {
		return 3 * time.Second
	}
	ms, err := strconv.Atoi(v)
	if err != nil || ms <= 0 {
		return 3 * time.Second
	}
	return time.Duration(ms) * time.Millisecond
}

func degradedReason(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}

	var ne net.Error
	if errors.As(err, &ne) {
		if ne.Timeout() {
			return "timeout"
		}
		return "unreachable"
	}

	// inference client 在 bad_status / bad_json 时返回 fmt.Errorf / json decode error，
	// 这里用 strings.Contains 做兜底归因。
	msg := err.Error()
	switch {
	case strings.Contains(msg, "status"):
		return "bad_status"
	case strings.Contains(msg, "invalid character") || strings.Contains(msg, "unexpected EOF") || strings.Contains(msg, "json"):
		return "bad_json"
	default:
		return "unreachable"
	}
}

// Inference MVP：同步编排 Go → Python 推理服务
// - 成功：返回推理服务输出 + request_id/content_version/degraded=false
// - 失败：返回降级结构 degraded=true（引导进入问题库/稍后再试）
func Inference(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	var in struct {
		AudioURL string         `json:"audio_url"`
		Context  map[string]any `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	requestID := "req_" + randHex(12)
	contentVersion := 1 // MVP：后续从 releases/runtime_config 决策

	base := os.Getenv("MIAODONG_INFERENCE_URL")
	if base == "" {
		// 本机默认（你可按实际部署改环境变量）
		base = "http://localhost:8001"
	}

	t0 := time.Now()
	timeout := inferenceTimeout()
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	c := inference.NewWithTimeout(base, timeout)
	out, err := c.Infer(ctx, inference.InferReq{AudioURL: in.AudioURL, Context: in.Context})
	latency := time.Since(t0).Milliseconds()
	if err != nil {
		reason := degradedReason(err)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"request_id":           requestID,
			"schema_version":       "1.0",
			"model_version":        "degraded",
			"content_version":      contentVersion,
			"degraded":             true,
			"degraded_reason":      reason,
			"inference_latency_ms": latency,
			"message":              "推理解读暂时不可用，你可以先进入问题库按场景排查，或稍后再试一次。",
			"fallback": map[string]any{
				"next": "open_problem_library",
			},
		})
		return
	}

	// 透传推理输出，并补齐编排字段
	out["request_id"] = requestID
	out["content_version"] = contentVersion
	out["degraded"] = false
	out["inference_latency_ms"] = latency
	if _, ok := out["schema_version"]; !ok {
		out["schema_version"] = "1.0"
	}

	_ = json.NewEncoder(w).Encode(out)
}

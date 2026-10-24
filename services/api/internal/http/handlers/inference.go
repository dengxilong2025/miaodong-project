package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/dengxilong2025/miaodong-project/services/api/internal/authctx"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/content"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/db"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/inference"
	"github.com/dengxilong2025/miaodong-project/services/api/internal/result"
)

// 测试可替换的依赖点（与 admin 内容 CRUD 的 openAdminContentDB 同思路）。
var (
	openInferenceDB = db.Open

	loadProblemBundleForInference = func(ctx context.Context, conn *sql.DB, problemID string) (content.Bundle, error) {
		if conn == nil {
			return content.Bundle{}, errors.New("db unavailable")
		}
		// 内容组装不能拖慢推理主链路。
		ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
		defer cancel()
		return content.GetProblemBundle(ctx, conn, problemID)
	}
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

// resolveInferenceContentVersion 读取 releases 的发布/灰度结果。
// DB 不可用时回退到 1，保证推理链路本身不被内容库拖垮。
func resolveInferenceContentVersion(r *http.Request, conn *sql.DB) int {
	if conn == nil {
		return 1
	}

	// 内容版本解析不能拖慢推理：DB 抖动时最多等 300ms，然后走降级版本。
	ctx, cancel := context.WithTimeout(r.Context(), 300*time.Millisecond)
	defer cancel()

	cv, err := content.ResolveContentVersionDB(ctx, conn, authctx.UserID(r.Context()), nil)
	if err != nil || cv <= 0 {
		return 1
	}
	return cv
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
	case strings.Contains(msg, "AUDIO_NORMALIZE_FAILED"):
		return "audio_normalize_failed"
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
		AudioURL       string         `json:"audio_url"`
		ProblemID      string         `json:"problem_id"`
		Entry          string         `json:"entry"`
		Context        map[string]any `json:"context"`
		ContextAnswers map[string]any `json:"context_answers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	conn, dbErr := openInferenceDB()
	if dbErr == nil && conn != nil {
		defer conn.Close()
	} else {
		conn = nil
	}

	requestID := "req_" + randHex(12)
	contentVersion := resolveInferenceContentVersion(r, conn)

	// 兼容 API_CONTRACT 的 context_answers 与客户端现用的 context。
	inferenceContext := in.Context
	if len(inferenceContext) == 0 {
		inferenceContext = in.ContextAnswers
	}

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
	out, err := c.Infer(ctx, inference.InferReq{AudioURL: in.AudioURL, Context: inferenceContext})
	latency := time.Since(t0).Milliseconds()
	if err != nil {
		reason := degradedReason(err)
		resp := map[string]any{
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
		}

		// 降级策略：带 problem_id 时补“仅问题库建议”，不伪装成完整结果。
		if in.ProblemID != "" {
			if b, err := loadProblemBundleForInference(r.Context(), conn, in.ProblemID); err == nil {
				result.ApplyDegradedSuggestions(resp, b)
			}
		}

		_ = json.NewEncoder(w).Encode(resp)
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

	// 成功后按 API_CONTRACT 组装问题库内容（追问/建议/风险/工具区/分享）。
	if in.ProblemID != "" {
		if b, err := loadProblemBundleForInference(r.Context(), conn, in.ProblemID); err == nil {
			result.ApplyContent(out, b)
		}
	}

	_ = json.NewEncoder(w).Encode(out)
}

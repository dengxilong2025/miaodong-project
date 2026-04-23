package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// AudioUploadURL 生成上传指引（MVP占位实现：先走“上传到API”而非 MinIO 直传）。
//
// 返回：
// - upload_url：PUT 该地址上传音频二进制
// - audio_url：GET 该地址可下载（供推理服务使用；后续替换为对象存储URL）
//
// 后续：替换为 MinIO/S3 presign（保持字段不变）
func AudioUploadURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	audioID := "a_" + randHex(16)
	base := baseURL(r)

	uploadURL := fmt.Sprintf("%s/v1/audio/upload/%s", base, audioID)
	audioURL := fmt.Sprintf("%s/v1/audio/%s", base, audioID)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"audio_id":    audioID,
		"upload_url":  uploadURL,
		"method":      "PUT",
		"headers":     map[string]string{"Content-Type": "application/octet-stream"},
		"expires_in":  int64(10 * 60),
		"audio_url":   audioURL,
		"storage":     "api-direct", // api-direct|minio-presign
		"created_at":  time.Now().Unix(),
	})
}

// AudioUploadByID 接收 PUT 上传并落本地临时目录。
// 约束：MVP阶段只用于联调与CI；线上会换对象存储。
func AudioUploadByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	audioID := strings.TrimPrefix(r.URL.Path, "/v1/audio/upload/")
	if audioID == "" {
		http.NotFound(w, r)
		return
	}

	p, err := audioPath(audioID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	f, err := os.Create(p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	if _, err := io.Copy(f, io.LimitReader(r.Body, 20*1024*1024)); err != nil { // 20MB hard limit
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AudioGetByID 下载音频（供联调用；后续可移除或改为代理对象存储）。
func AudioGetByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	audioID := strings.TrimPrefix(r.URL.Path, "/v1/audio/")
	if audioID == "" {
		http.NotFound(w, r)
		return
	}
	p, err := audioPath(audioID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	http.ServeFile(w, r, p)
}

func audioPath(audioID string) (string, error) {
	if !strings.HasPrefix(audioID, "a_") {
		return "", fmt.Errorf("invalid audio_id")
	}
	return filepath.Join(os.TempDir(), "miaodong-audio", audioID+".bin"), nil
}

func baseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if xf := r.Header.Get("X-Forwarded-Proto"); xf != "" {
		scheme = xf
	}
	host := r.Host
	return scheme + "://" + host
}


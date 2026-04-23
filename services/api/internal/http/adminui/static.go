package adminui

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
)

const envAdminUIDir = "MIAODONG_ADMIN_UI_DIR"

// Handler returns a http.Handler that serves the static Admin Web under /admin/ui/.
//
// It locates the repo root relative to this file (unless overridden by env
// MIAODONG_ADMIN_UI_DIR), expects apps/admin/index.html to exist, and serves files
// via http.FileServer.
//
// Note: the returned handler is meant to be mounted at "/admin/ui/".
func Handler() (http.Handler, error) {
	adminDir, err := adminUIDir()
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(adminDir, "index.html")); err != nil {
		return nil, fmt.Errorf("admin ui missing index.html at %s: %w", adminDir, err)
	}

	fs := http.FileServer(http.Dir(adminDir))

	// StripPrefix uses "/admin/ui" (no trailing slash) so "/admin/ui/" becomes "/"
	// instead of "", which avoids FileServer redirecting on empty paths.
	return http.StripPrefix("/admin/ui", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Ensure FileServer always receives an absolute path (leading slash).
		// When StripPrefix results in an empty path, net/http's FileServer may
		// canonicalize it into "." and redirect to "./" (redirect loop).
		p := r.URL.Path
		if p == "" || p == "." {
			p = "/"
		}

		r2 := new(http.Request)
		*r2 = *r
		r2.URL = new(url.URL)
		*r2.URL = *r.URL
		r2.URL.Path = p

		fs.ServeHTTP(w, r2)
	})), nil
}

func adminUIDir() (string, error) {
	if v := os.Getenv(envAdminUIDir); v != "" {
		return filepath.Clean(v), nil
	}

	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("runtime.Caller failed")
	}

	// .../services/api/internal/http/adminui/static.go -> repo root
	root := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "..", ".."))
	return filepath.Join(root, "apps", "admin"), nil
}
